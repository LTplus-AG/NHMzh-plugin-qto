/**
 * Kafka consumer integration module
 *
 * This module provides functionality for setting up and starting a Kafka consumer.
 *
 * @module kafka
 */

import {
  Kafka,
  Consumer,
  KafkaMessage,
  Producer,
  EachBatchPayload,
} from "kafkajs";
import { getEnv } from "./utils/env";
import { log } from "./utils/logger";

/**
 * Setup the Kafka consumer
 * @returns The Kafka consumer
 */
export async function setupKafkaConsumer(): Promise<Consumer> {
  const kafka = new Kafka({
    clientId: "qto-ifc-consumer",
    brokers: [getEnv("KAFKA_BROKER")],

    // Custom log creator to log Kafka messages to align with the logger in this service
    logCreator:
      () =>
      ({ namespace, level, label, log }) => {
        const logLevel = String(level).toLowerCase();
        log.log = { namespace, label, ...log };
        log.logger?.includes("kafkajs") && log.message && log.log;
        if (logLevel === "error") {
          log.error(log.message, log.log);
        } else if (logLevel === "warn") {
          log.warn(log.message, log.log);
        } else if (logLevel === "info") {
          log.info(log.message, log.log);
        } else if (logLevel === "debug") {
          log.debug(log.message, log.log);
        }
      },
  });

  const consumer = kafka.consumer({
    groupId: "qto-ifc-consumer-group",
    sessionTimeout: 240000, // Increased to 240 seconds (4 minutes)
    heartbeatInterval: 3000, // Keep heartbeat interval at 3 seconds
  });

  try {
    log.debug("Connecting to Kafka");
    await consumer.connect();
    log.debug("Subscribing to Kafka topic");
    await consumer.subscribe({
      topic: getEnv("KAFKA_IFC_TOPIC"),
      fromBeginning: false,
    });
    log.debug("Kafka consumer connected and subscribed to topic");
    return consumer;
  } catch (error: any) {
    log.error("Failed to connect to Kafka:", error);
    // Exit with a non-zero code to trigger restart
    process.exit(1);
  }
}

/**
 * Start the Kafka consumer using eachBatch for better handling of long tasks.
 * @param consumer - The Kafka consumer
 * @param messageHandler - The message handler, expected to handle errors and resolve offsets.
 *                       Receives { message, resolveOffset, heartbeat }.
 */
export async function startKafkaConsumer(
  consumer: Consumer,
  // Update handler signature to accept necessary payload components
  messageHandler: (payload: {
    message: KafkaMessage;
    resolveOffset: (offset: string) => void;
    heartbeat: () => Promise<void>;
    topic: string; // Pass topic and partition for context
    partition: number;
  }) => Promise<void>
): Promise<void> {
  try {
    await consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({
        batch,
        resolveOffset,
        heartbeat,
        commitOffsetsIfNecessary,
        isRunning,
        isStale,
      }: EachBatchPayload) => {
        log.debug(`Received batch with ${batch.messages.length} messages.`);

        if (!isRunning() || isStale()) {
          log.warn(
            "Consumer stopping or batch stale, skipping entire batch processing."
          );
          // Resolve all offsets in a stale/stopped batch to avoid reprocessing them individually later
          for (const message of batch.messages) {
            if (message.offset) {
              // Ensure offset exists before trying to resolve
              resolveOffset(message.offset);
            }
          }
          try {
            await commitOffsetsIfNecessary(); // Attempt to commit resolved offsets
            log.debug("Committed offsets for stale/stopped batch.");
          } catch (commitError) {
            log.error("Error committing offsets for stale/stopped batch:", {
              err: commitError,
            });
          }
          return; // Exit early
        }

        // Filter for latest message per projectKey within the batch
        const latestMessagesToProcess = new Map<string, KafkaMessage>();
        const offsetsToResolveWithoutProcessing = new Set<string>();

        for (const message of batch.messages) {
          if (!message.value) {
            log.warn(
              `Message with offset ${message.offset} has null value, scheduling for offset resolution.`
            );
            if (message.offset)
              offsetsToResolveWithoutProcessing.add(message.offset);
            continue;
          }

          // Use fileID (before '.ifc') as a stand-in for projectKey if message.key is not reliable
          // This assumes fileID uniquely identifies a project's dataset for versioning purposes.
          // A more robust solution would be a dedicated project ID in message.key or value.
          const fileIdForProjectKey =
            extractFileIDForLogging(message).split(".")[0];
          const projectKey = message.key?.toString() || fileIdForProjectKey;

          // Kafka message.timestamp is the append time to Kafka, not necessarily data creation time.
          // For true latest, data's own timestamp from MinIO metadata would be better,
          // but fetching it for all messages here is too slow.
          // Using message.timestamp (Kafka append time) is an approximation for "latest in batch".
          const messageTimestamp = message.timestamp;

          const existing = latestMessagesToProcess.get(projectKey);
          if (
            !existing ||
            Number(messageTimestamp) > Number(existing.timestamp)
          ) {
            if (existing && existing.offset) {
              offsetsToResolveWithoutProcessing.add(existing.offset);
            }
            latestMessagesToProcess.set(projectKey, message);
          } else {
            if (message.offset)
              offsetsToResolveWithoutProcessing.add(message.offset);
          }
        }

        log.debug(
          `Identified ${latestMessagesToProcess.size} latest messages to process out of ${batch.messages.length}.`
        );
        log.debug(
          `${offsetsToResolveWithoutProcessing.size} messages will have their offsets resolved without full processing.`
        );

        // Resolve offsets for messages that won't be processed
        for (const offset of offsetsToResolveWithoutProcessing) {
          resolveOffset(offset);
        }

        // Process the identified latest messages
        for (const message of latestMessagesToProcess.values()) {
          if (!isRunning() || isStale()) {
            log.warn(
              "Consumer stopping or batch stale during main processing loop of latest messages."
            );
            // Note: some offsets might have been resolved already.
            // If we bail here, remaining latest messages in this map won't be processed in this iteration.
            break;
          }

          const fileIDForLogging = extractFileIDForLogging(message);
          log.debug(
            `Processing latest message for projectKey '${
              message.key?.toString() || fileIDForLogging.split(".")[0]
            }', offset ${message.offset} (FileID: ${fileIDForLogging}).`
          );

          try {
            await heartbeat();
            await messageHandler({
              message,
              resolveOffset, // messageHandler will call this for the processed message
              heartbeat,
              topic: batch.topic,
              partition: batch.partition,
            });
            // Heartbeat after successful processing is handled by the caller (messageHandler or its success path)
          } catch (processingError: any) {
            log.error(
              `Error in messageHandler for LATEST message offset ${message.offset} (FileID: ${fileIDForLogging}). Message will likely be reprocessed.`,
              {
                err: processingError,
                kafkaMessageOffset: message.offset,
                kafkaMessageTopic: batch.topic,
                kafkaMessagePartition: batch.partition,
                processingFileID: fileIDForLogging,
              }
            );
            // Do NOT resolve offset on error here; messageHandler is responsible or it will be retried.
          }
        }

        // Commit all resolved offsets (both skipped and processed)
        try {
          await commitOffsetsIfNecessary();
          log.debug(
            "Batch offset commit attempt finished for current batch processing logic."
          );
        } catch (commitError) {
          log.error("Error during final commitOffsetsIfNecessary for batch:", {
            err: commitError,
          });
        }
      },
    });
  } catch (error: any) {
    log.error(
      "Fatal error running Kafka consumer (consumer.run() failed). The consumer will attempt to exit.",
      { err: error }
    );
    process.exit(1);
  }
}

// Helper function for consistent File ID extraction for logging
function extractFileIDForLogging(message: KafkaMessage): string {
  try {
    if (message.value) {
      const rawValue = message.value.toString();
      const parts = rawValue.split("/");
      const extracted = parts.pop();
      if (extracted) {
        return (
          extracted.split("?")[0].split("#")[0] || "extracted_empty_fileID"
        );
      } else {
        return "could_not_extract_fileID_from_path";
      }
    } else {
      return "message_value_is_null";
    }
  } catch (parseError) {
    log.warn(
      "Failed to parse Kafka message value for fileID extraction (for logging only)",
      { err: parseError, rawMessageValue: message.value?.toString() }
    );
    return "message_value_parsing_failed";
  }
}
