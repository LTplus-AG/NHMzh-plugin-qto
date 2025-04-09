/**
 * IFC consumer module
 *
 * This module is the entry point for the IFC consumer.
 *
 * @module index
 */

import { setupKafkaConsumer, startKafkaConsumer } from "./kafka";
import { getFile, getFileMetadata, minioClient } from "./minio";
import { log } from "./utils/logger";
import { getEnv } from "./utils/env";
import { IFCData } from "./types";
import { sendIFCFile } from "./send";

const IFC_BUCKET_NAME = getEnv("MINIO_IFC_BUCKET");

/**
 * Main function to start the IFC consumer
 * Ensures the WASM file is downloaded
 * Sets up the Kafka consumer
 * Starts the Kafka consumer
 */
async function main() {
	log.info("Starting server...");

	log.info("Setting up Kafka consumer...");
	const consumer = await setupKafkaConsumer();
	log.info("Kafka consumer setup complete");

	log.info("Starting Kafka consumer...");
	await startKafkaConsumer(consumer, async (message: any) => {
		if (message.value) {
			try {
				log.info("Processing Kafka message:", message.value);
				const downloadLink = message.value.toString();
				const fileID = downloadLink.split("/").pop();
				const file = await getFile(fileID, IFC_BUCKET_NAME, minioClient);
				if (!file) {
					log.error(`File ${fileID} not found`);
					return;
				}

				const metadata = await getFileMetadata(fileID, IFC_BUCKET_NAME, minioClient);
				const ifcData: IFCData = {
					project: metadata.project,
					filename: metadata.filename,
					timestamp: metadata.timestamp,
					file: file,
				};

				await sendIFCFile(ifcData);
			} catch (error: any) {
				log.error("Error processing Kafka message:", error);
			}
		}
	});

	log.info("Kafka consumer started");
}

if (require.main === module) {
	main().catch(log.error);
}
