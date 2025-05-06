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
      autoCommit: false, // Disable auto-commit
      eachMessage: async ({ topic, partition, message }) => {
        let commitOffset = (Number(message.offset) + 1).toString();
        try {
          log.debug(
            `Processing message from topic ${topic}, partition ${partition}, offset ${message.offset}...`
          );
          await messageHandler(message);

          // Commit offset after successful processing
          await consumer.commitOffsets([
            { topic, partition, offset: commitOffset },
          ]);
          log.debug(
            `Committed offset ${commitOffset} for topic ${topic}, partition ${partition}`
          );
        } catch (error: any) {
          log.error("Error processing message:", error);

          // Commit offset even if processing failed, to skip this message
          await consumer.commitOffsets([
            { topic, partition, offset: commitOffset },
          ]);
          log.warn(
            `Committed offset ${commitOffset} for topic ${topic}, partition ${partition} after failure (skipping message)`
          );
        }
      },
    });
  } catch (error: any) {
    log.error("Error running Kafka consumer:", error);
    process.exit(1);
  }
}
