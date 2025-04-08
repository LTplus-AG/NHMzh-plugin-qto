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
		clientId: "viz-ifc-consumer",
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

	const consumer = kafka.consumer({ groupId: "viz-ifc-consumer-group" });

	try {
		log.debug("Connecting to Kafka");
		await consumer.connect();
		log.debug("Subscribing to Kafka topic");
		await consumer.subscribe({ topic: getEnv("KAFKA_IFC_TOPIC"), fromBeginning: true });
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
export async function startKafkaConsumer(consumer: Consumer, messageHandler: (message: any) => Promise<void>): Promise<void> {
	try {
		await consumer.run({
			eachMessage: async ({ topic, partition, message }) => {
				log.debug(`Received message from topic ${topic}, partition ${partition}, offset ${message.offset}`);
				await messageHandler(message);
			},
		});
	} catch (error: any) {
		log.error("Error running Kafka consumer:", error);
		// Exit with a non-zero code to trigger restart
		process.exit(1);
	}
}
