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
import { Readable } from "stream";
import { KafkaMessage } from "kafkajs";

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
  await startKafkaConsumer(
    consumer,
    async ({ message, resolveOffset, heartbeat, topic, partition }) => {
      if (message.value) {
        let fileID: string | undefined;
        let fileStream: Readable | undefined;

        try {
          log.info(`Starting processing for offset ${message.offset}`);

          await heartbeat();
          log.debug(
            `Heartbeat sent before getFile for offset ${message.offset}`
          );

          fileID = message.value.toString().split("/").pop();
          if (!fileID) {
            log.error(
              "Could not extract fileID from download link – skipping",
              {
                link: message.value.toString(),
                offset: message.offset,
              }
            );
            resolveOffset(message.offset); // mark as handled
            return;
          }
          log.info(`Extracted fileID: ${fileID}`);

          fileStream = await getFile(fileID, IFC_BUCKET_NAME, minioClient);
          log.info(`Successfully obtained file stream for ${fileID}`);

          await heartbeat();
          log.debug(
            `Heartbeat sent before getFileMetadata for offset ${message.offset}`
          );

          const metadata = await getFileMetadata(
            fileID,
            IFC_BUCKET_NAME,
            minioClient
          );
          log.info(`Successfully retrieved metadata for ${fileID}:`, metadata);

          const projectName = metadata.project || "Default-Project-Name";
          if (!metadata.project) {
            log.warn(
              `metadata.project was empty for fileID ${fileID}. Using default: "${projectName}"`
            );
          }

          const ifcData: IFCData = {
            project: projectName,
            filename: metadata.filename,
            timestamp: metadata.timestamp,
            fileStream: fileStream,
            fileSize: metadata.size,
          };

          await heartbeat();
          log.debug(
            `Heartbeat sent before sendIFCFile for offset ${message.offset}`
          );

          // sendIFCFile now returns JobAcceptedResponse
          const jobAcceptance = await sendIFCFile(
            ifcData,
            async (progressEvent) => {
              if (progressEvent.loaded && progressEvent.total) {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                log.debug(
                  `Upload progress for offset ${message.offset}, fileID ${ifcData.filename}: ${percentCompleted}%`
                );
              }
              await heartbeat(); // Heartbeat during progress
            }
          );

          log.info(
            `File submission accepted by backend for offset ${message.offset}. Job ID: ${jobAcceptance.job_id}`,
            {
              filename: ifcData.filename,
              project: ifcData.project,
              jobId: jobAcceptance.job_id,
              statusEndpoint: jobAcceptance.status_endpoint,
            }
          );

          await heartbeat(); // Heartbeat after job acceptance, before resolving offset
          resolveOffset(message.offset);
          log.info(`Offset ${message.offset} resolved.`);
        } catch (error: any) {
          log.error(
            `Error processing Kafka message for fileID '${
              fileID || "unknown"
            }':`,
            { err: error, offset: message.offset }
          );
          resolveOffset(message.offset);
          log.warn(
            `Offset ${
              message.offset
            } resolved after error to prevent Kafka loop. Check logs for details about FileID '${
              fileID || "unknown"
            }'.`
          );
        }
      } else {
        log.warn("Received Kafka message with empty value", {
          offset: message.offset,
        });
        resolveOffset(message.offset);
        log.warn(`Offset ${message.offset} for empty message resolved.`);
      }
    }
  );
  log.info("Kafka consumer processing loop started");
}

if (require.main === module) {
  main().catch(log.error);
}
