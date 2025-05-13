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

  const consumer = kafka.consumer({ groupId: "qto-ifc-consumer-group" });

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
      // Use eachBatch for better control over long tasks and heartbeats
      eachBatchAutoResolve: false, // We will manually resolve offsets
      eachBatch: async ({
        batch,
        resolveOffset,
        heartbeat,
        commitOffsetsIfNecessary, // Use this for efficient commits
        isRunning,
        isStale,
      }: EachBatchPayload) => {
        log.debug(`Received batch with ${batch.messages.length} messages.`);

        for (const message of batch.messages) {
          // Prevent processing if consumer is stopping or batch is stale
          if (!isRunning() || isStale()) {
            log.warn(
              "Consumer stopping or batch stale, skipping message processing."
            );
            break; // Exit the loop for this batch
          }

          const fileIDForLogging = extractFileIDForLogging(message); // Extract logging helper

          log.debug(
            `Processing message offset ${message.offset} (FileID: ${fileIDForLogging}) from batch.`
          );

          try {
            // Send heartbeat before starting processing for this message
            await heartbeat();

            // Call the actual message handler logic
            await messageHandler({
              message,
              resolveOffset,
              heartbeat,
              topic: batch.topic,
              partition: batch.partition,
            });

            // Heartbeat again after successful processing (optional, but good practice)
            await heartbeat();
          } catch (processingError: any) {
            log.error(
              `Error in messageHandler for offset ${message.offset} (FileID: ${fileIDForLogging}). Message will likely be reprocessed.`,
              {
                err: processingError,
                kafkaMessageOffset: message.offset,
                kafkaMessageTopic: batch.topic,
                kafkaMessagePartition: batch.partition,
                processingFileID: fileIDForLogging,
              }
            );
            // Do NOT resolve offset on error, let it be reprocessed.
            // Consider adding a dead-letter queue mechanism here for persistent errors.
          }
        }

        // Commit offsets for all resolved messages in this batch
        log.debug(
          `Attempting to commit resolved offsets for batch (up to offset ${batch.lastOffset()}).`
        );
        await commitOffsetsIfNecessary();
        log.debug("Batch offset commit attempt finished.");
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
