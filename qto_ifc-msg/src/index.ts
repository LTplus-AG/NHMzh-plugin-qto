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
      let fileID: string | undefined;
      try {
        log.info(
          "Processing Kafka message value (as string):",
          message.value.toString()
        );
        const downloadLink = message.value.toString();
        fileID = downloadLink.split("/").pop();
        if (!fileID) {
          log.error("Could not extract fileID from download link", {
            link: downloadLink,
          });
          return;
        }

        log.info(`Extracted fileID: ${fileID}`);
        const file = await getFile(fileID, IFC_BUCKET_NAME, minioClient);
        if (!file) {
          log.error(
            `File ${fileID} not found or getFile returned null/undefined.`
          );
          return;
        }
        log.info(
          `Successfully downloaded file ${fileID}, size: ${file.length} bytes`
        );

        const metadata = await getFileMetadata(
          fileID,
          IFC_BUCKET_NAME,
          minioClient
        );
        log.info(`Successfully retrieved metadata for ${fileID}:`, metadata);

        const ifcData: IFCData = {
          project: metadata.project,
          filename: metadata.filename,
          timestamp: metadata.timestamp,
          file: file,
        };

        await sendIFCFile(ifcData);
        log.info(
          `Successfully processed and sent file derived from message offset ${message.offset}`
        );
      } catch (error: any) {
        log.error(
          `Error processing Kafka message for fileID '${
            fileID || "unknown"
          }' (offset: ${message.offset})`,
          error
        );
        // Re-throw the error to prevent offset commit by kafkajs
        throw error;
      }
    } else {
      log.warn("Received Kafka message with empty value", {
        offset: message.offset,
      });
    }
  });

  log.info("Kafka consumer processing loop started");
}

if (require.main === module) {
  main().catch(log.error);
}
