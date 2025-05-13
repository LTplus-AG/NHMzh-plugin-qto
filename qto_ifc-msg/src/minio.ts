/**
 * MinIO client integration module
 *
 * This module provides functionality for interacting with the MinIO storage service
 * for files that are closely related with the core platform.
 *
 * @module minio
 */

import { Client as MinioClient } from "minio";
import { log } from "./utils/logger";
import { getEnv } from "./utils/env";
import { Readable } from "stream";

/**
 * The metadata of an IFC file in MinIO
 */
export type FileMetadata = {
  timestamp: string;
  project: string;
  filename: string;
};

/**
 * Create a Minio client
 * @returns MinioClient
 */
export const minioClient = new MinioClient({
  endPoint: getEnv("MINIO_ENDPOINT"),
  port: parseInt(getEnv("MINIO_PORT")),
  useSSL: getEnv("MINIO_USE_SSL") === "true",
  accessKey: getEnv("MINIO_ACCESS_KEY"),
  secretKey: getEnv("MINIO_SECRET_KEY"),
});

/**
 * Get a file from MinIO
 * @param fileID - The ID of the file object in the bucket
 * @param bucketName - The bucket name
 * @param client - MinioClient
 * @returns The file as a Readable Stream
 * @throws Error if the file cannot be retrieved
 */
export async function getFile(
  fileID: string,
  bucketName: string,
  client: MinioClient
): Promise<Readable> {
  log.debug(`Getting file stream from ${bucketName} at ${fileID} in MinIO`);
  try {
    const stream = await client.getObject(bucketName, fileID);
    return stream;
  } catch (error) {
    log.error(`Failed to get file stream for ${fileID} from ${bucketName}`, {
      err: error,
    });
    throw error; // Re-throw to be handled by the caller
  }
}

/**
 * Get the metadata of a file
 * @param fileID - The ID of the file object in the bucket
 * @param bucketName - The bucket name
 * @param client - MinioClient
 * @returns The metadata of the file as an object
 */
export async function getFileMetadata(
  fileID: string,
  bucketName: string,
  client: MinioClient
): Promise<FileMetadata> {
  log.debug(
    `Getting metadata for file from ${bucketName} at ${fileID} in MinIO`
  );
  const statObject = await client.statObject(bucketName, fileID);
  return {
    timestamp: statObject.metaData["created-at"], // Ensure proper casing
    project: statObject.metaData["project-name"], // Match MinIO key
    filename: statObject.metaData["filename"], // Match MinIO key
  };
}
