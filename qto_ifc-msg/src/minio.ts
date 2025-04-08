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
 * @returns The file as a Buffer
 * @throws Error if the file cannot be retrieved
 */
export async function getFile(fileID: string, bucketName: string, client: MinioClient): Promise<Buffer> {
	log.debug(`Getting file from ${bucketName} at ${fileID} in MinIO`);
	const stream = await client.getObject(bucketName, fileID);
	const chunks: Buffer[] = [];
	return new Promise((resolve, reject) => {
		stream.on("data", (chunk) => chunks.push(chunk));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}

/**
 * Get the metadata of a file
 * @param fileID - The ID of the file object in the bucket
 * @param bucketName - The bucket name
 * @param client - MinioClient
 * @returns The metadata of the file as an object
 */
export async function getFileMetadata(fileID: string, bucketName: string, client: MinioClient): Promise<FileMetadata> {
	log.debug(`Getting metadata for file from ${bucketName} at ${fileID} in MinIO`);
	const statObject = await client.statObject(bucketName, fileID);
	return {
		timestamp: statObject.metaData["created-at"], // Ensure proper casing
		project: statObject.metaData["project-name"], // Match MinIO key
		filename: statObject.metaData["filename"], // Match MinIO key
	};
}
