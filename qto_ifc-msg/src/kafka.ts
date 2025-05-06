/**
 * Kafka consumer integration module
 *
 * This module provides functionality for setting up and starting a Kafka consumer.
 *
 * @module kafka
 */

import { Kafka, Consumer } from "kafkajs";
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
 * @param messageHandler - The message handler
 */
export async function startKafkaConsumer(
  consumer: Consumer,
  messageHandler: (message: any) => Promise<void>
): Promise<void> {
  try {
    await consumer.run({
      autoCommit: false, // Explicitly disable auto-commit
      eachMessage: async ({ topic, partition, message }) => {
        const commitOffset = (Number(message.offset) + 1).toString();
        try {
          log.info(
            // Changed from debug for visibility
            `Processing message from topic ${topic}, partition ${partition}, offset ${message.offset}...`
          );
          // The messageHandler from index.ts is expected to handle its own errors
          // and not throw them, allowing this 'try' block to complete.
          await messageHandler(message);

          // Commit offset after messageHandler has completed (successfully or by handling its own error)
          log.info(
            // Changed from debug for visibility
            `Attempting to commit offset ${commitOffset} for topic ${topic}, partition ${partition} (after messageHandler completion)`
          );
          await consumer.commitOffsets([
            { topic, partition, offset: commitOffset },
          ]);
          log.info(
            // Changed from debug for visibility
            `Committed offset ${commitOffset} for topic ${topic}, partition ${partition}`
          );
        } catch (error: any) {
          // This catch block is a failsafe.
          // It would only be hit if messageHandler (from index.ts) unexpectedly throws an error
          // instead of catching it internally as designed.
          log.error(
            `Unexpected error thrown by messageHandler in kafka.ts for offset ${message.offset} (topic: ${topic}, partition: ${partition}):`,
            error
          );

          // Still attempt to commit offset to prevent retries for this unexpected error.
          log.warn(
            // Changed from debug for visibility
            `Attempting to commit offset ${commitOffset} for topic ${topic}, partition ${partition} (after unexpected error in messageHandler)`
          );
          try {
            await consumer.commitOffsets([
              { topic, partition, offset: commitOffset },
            ]);
            log.warn(
              // Changed from debug for visibility
              `Committed offset ${commitOffset} for topic ${topic}, partition ${partition} after unexpected error (skipping message)`
            );
          } catch (commitError) {
            log.error(
              `Failed to commit offset ${commitOffset} after unexpected error in messageHandler:`,
              { errorDetail: commitError }
            );
          }
        }
      },
    });
  } catch (error: any) {
    // This catches errors from consumer.run() itself, e.g., Kafka connection issues.
    log.error("Critical error running Kafka consumer:", error);
    process.exit(1); // Exit if the consumer itself fails critically.
  }
}
