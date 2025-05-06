/**
 * Kafka consumer integration module
 *
 * This module provides functionality for setting up and starting a Kafka consumer.
 *
 * @module kafka
 */

import { Kafka, Consumer, KafkaMessage, Producer } from "kafkajs";
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
 * Start the Kafka consumer
 * @param consumer - The Kafka consumer
 * @param messageHandler - The message handler, expected to throw on error
 */
export async function startKafkaConsumer(
  consumer: Consumer,
  messageHandler: (message: KafkaMessage) => Promise<void>
): Promise<void> {
  try {
    await consumer.run({
      autoCommit: false, // Manual commit is essential for this error handling
      eachMessage: async ({ topic, partition, message }) => {
        const commitOffset = (Number(message.offset) + 1).toString();
        let fileIDForLogging: string = "unknown_fileID_in_kafka.ts"; // Default for logging if extraction fails

        try {
          // Attempt to extract fileID from message for logging purposes ONLY.
          if (message.value) {
            const rawValue = message.value.toString();
            const parts = rawValue.split("/");
            const extracted = parts.pop();
            if (extracted) {
              fileIDForLogging =
                extracted.split("?")[0].split("#")[0] ||
                "extracted_empty_fileID";
            } else {
              fileIDForLogging = "could_not_extract_fileID_from_path";
            }
          } else {
            fileIDForLogging = "message_value_is_null_in_kafka.ts";
          }
        } catch (parseError) {
          log.warn(
            "Failed to parse Kafka message value for fileID extraction in kafka.ts eachMessage (for logging only)",
            { err: parseError, rawMessageValue: message.value?.toString() }
          );
          fileIDForLogging = "message_value_parsing_failed_in_kafka.ts";
        }

        try {
          log.info(
            // Changed from debug for better visibility during troubleshooting
            `Processing message from topic ${topic}, partition ${partition}, offset ${message.offset}, tentative_fileID: ${fileIDForLogging}...`
          );
          await messageHandler(message); // messageHandler is now expected to throw on critical failure

          // If messageHandler completes without throwing, commit offset for successful processing
          log.info(
            // Changed from debug
            `Attempting to commit offset ${commitOffset} for topic ${topic}, partition ${partition} (message offset ${message.offset}) after successful processing.`
          );
          await consumer.commitOffsets([
            { topic, partition, offset: commitOffset },
          ]);
          log.info(
            // Changed from debug
            `Successfully committed offset ${commitOffset} for topic ${topic}, partition ${partition} (message offset ${message.offset}) after successful processing.`
          );
        } catch (processingError: any) {
          // This block is now hit if messageHandler (from index.ts) throws an error
          log.error(
            `Error thrown by messageHandler for fileID (tentative) '${fileIDForLogging}' (offset: ${message.offset}). Attempting to skip.`,
            {
              err: processingError,
              kafkaMessageOffset: message.offset,
              kafkaMessageTopic: topic,
              kafkaMessagePartition: partition,
              processingFileID: fileIDForLogging, // fileID extracted for logging in kafka.ts
              // Include relevant parts of processingError if it's an Axios error, for example
              axiosErrorStatus: processingError?.response?.status,
              axiosErrorResponseData: processingError?.response?.data, // Be cautious with large data
            }
          );

          log.warn(
            `Attempting to commit offset ${commitOffset} for topic ${topic}, partition ${partition} (message offset ${message.offset}) after processing failure, to skip message.`,
            {
              topic: topic,
              partition: partition,
              offset: message.offset,
              commitOffset: commitOffset,
              fileIDForLogging: fileIDForLogging,
            }
          );
          try {
            await consumer.commitOffsets([
              { topic, partition, offset: commitOffset },
            ]);
            log.warn(
              `Successfully committed offset ${commitOffset} (for message offset ${message.offset}) after processing failure, effectively skipping message.`,
              {
                kafkaMessageOffset: message.offset,
                committedOffset: commitOffset,
                topic: topic,
                partition: partition,
                skippedFileID: fileIDForLogging,
              }
            );
          } catch (commitError: any) {
            const criticalErrorMessage = `CRITICAL FAILURE: Failed to commit offset ${commitOffset} (for message offset ${message.offset}) for fileID (tentative) '${fileIDForLogging}' AFTER a processing error. Message will likely be reprocessed, risking a loop.`;

            // Fallback logging using console.error in case the main logger is also failing
            console.error(criticalErrorMessage, {
              commitErrorDetail: String(commitError),
              commitErrorStack:
                commitError instanceof Error ? commitError.stack : undefined,
              originalProcessingErrorDetail: String(processingError),
              originalProcessingErrorStack:
                processingError instanceof Error
                  ? processingError.stack
                  : undefined,
            });

            log.error(criticalErrorMessage, {
              err: commitError,
              originalProcessingError: {
                // Provide context of the original error
                message: processingError?.message,
                stack: processingError?.stack, // Log stack of original error
                status: processingError?.response?.status,
              },
              kafkaMessageOffset: message.offset,
              attemptedCommitOffset: commitOffset,
              topic: topic,
              partition: partition,
              fileID: fileIDForLogging,
            });
            // To prevent the consumer from crashing and ensure it continues to process other messages (if possible),
            // we don't re-throw here. The message is already stuck if this commit fails.
            // External monitoring should pick up the 'CRITICAL FAILURE' logs.
          }
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
