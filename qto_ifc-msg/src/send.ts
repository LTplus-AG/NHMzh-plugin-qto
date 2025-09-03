// This file is used to send the IFC file to the backend service

import { IFCData, JobAcceptedResponse } from "./types";
import { getEnv } from "./utils/env";
import { log } from "./utils/logger";
import FormData from "form-data";
import axios, { AxiosProgressEvent, AxiosResponse } from "axios";


const BACKEND_URL = getEnv("BACKEND_URL");
const UPLOAD_ENDPOINT = `${BACKEND_URL}/upload-ifc/`;

/**
 * Safely extracts non-circular, minimal fields from an Axios request object
 * to prevent logger crashes from large/circular objects
 */
function safeSerializeRequest(request: any): Record<string, unknown> | undefined {
  if (!request) return undefined;

  const safeRequest: Record<string, unknown> = {};

  try {
    // Extract basic request info
    if (request.method) safeRequest.method = request.method;
    if (request.path) safeRequest.path = request.path;
    if (request.url) safeRequest.url = request.url;
    if (request.protocol) safeRequest.protocol = request.protocol;
    if (request.host) safeRequest.host = request.host;
    if (request.hostname) safeRequest.hostname = request.hostname;
    if (request.port) safeRequest.port = request.port;
    if (request.timeout) safeRequest.timeout = request.timeout;

    // Extract a subset of headers (avoid large/complex ones)
    if (request.headers) {
      const headers: Record<string, unknown> = {};
      const safeHeaderKeys = ['content-type', 'content-length', 'user-agent', 'accept', 'authorization'];

      for (const key of safeHeaderKeys) {
        const value = request.headers[key];
        if (value && typeof value === 'string' && value.length < 500) {
          headers[key] = value;
        }
      }

      if (Object.keys(headers).length > 0) {
        safeRequest.headers = headers;
      }
    }

    // Extract basic socket info if available
    if (request.socket) {
      safeRequest.socket = {
        remoteAddress: request.socket.remoteAddress,
        remotePort: request.socket.remotePort,
        localAddress: request.socket.localAddress,
        localPort: request.socket.localPort,
        destroyed: request.socket.destroyed,
      };
    }

    // Avoid circular references and large objects
    // Don't include: body, stream, _events, _eventsCount, etc.
  } catch (error) {
    // If serialization fails, return minimal fallback
    return { serializationError: 'Failed to safely serialize request' };
  }

  return safeRequest;
}

export async function sendIFCFile(
  ifcData: IFCData,
  onProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<JobAcceptedResponse> {
  try {
    log.info(
      `Preparing to send file stream ${ifcData.filename} to ${UPLOAD_ENDPOINT}`
    );

    const formData = new FormData();

    // Append the stream directly to FormData
    formData.append("file", ifcData.fileStream, {
      filename: ifcData.filename,
      contentType: "application/octet-stream", // Or the appropriate MIME type if known
      knownLength: ifcData.fileSize, // Add knownLength to help prevent buffering
    });

    // Append other metadata
    formData.append("project", ifcData.project);
    formData.append("filename", ifcData.filename);
    formData.append("timestamp", ifcData.timestamp);

    log.info(
      `Sending multipart stream request via Axios to ${UPLOAD_ENDPOINT}`
    );

    const response: AxiosResponse<JobAcceptedResponse> = await axios.post(
      UPLOAD_ENDPOINT,
      formData,
      {
        headers: {
          ...formData.getHeaders(), // Let FormData set the correct Content-Type and boundary
        },
        maxContentLength: Infinity, // Allow large uploads
        maxBodyLength: Infinity, // Allow large uploads
        onUploadProgress: onProgress, // Pass the callback here
        validateStatus: function (status: number) {
          return status === 202; // Expect 202 Accepted
        },
      }
    );

    log.info(
      `File upload accepted by backend. Status: ${response.status}. Job ID: ${response.data.job_id}`
    );
    return response.data;
  } catch (error: unknown) {
    let errorMsg = `Error sending file stream ${ifcData.filename} to backend`;
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Backend responded with an error status (other than 202)
        errorMsg = `Backend responded with error during file submission: ${
          error.response.status
        } ${error.response.statusText} - ${JSON.stringify(
          error.response.data
        )}`;
        log.error(errorMsg, {
          data: error.response.data,
          status: error.response.status,
        });
      } else if (error.request) {
        // Request was made but no response received
        errorMsg = `No response received from backend for file submission: ${(error as any).message}`;
        log.error(errorMsg, { requestDetails: safeSerializeRequest(error.request) });
      } else {
        // Something happened in setting up the request
        errorMsg = `Error setting up file submission request: ${(error as any).message}`;
        log.error(errorMsg);
      }
    } else {
      // Non-Axios error
      log.error(errorMsg, error as Record<string, unknown>);
    }
    // Ensure the stream is destroyed on error to prevent leaks
    if (ifcData.fileStream && !ifcData.fileStream.destroyed) {
      ifcData.fileStream.destroy(error as Error);
      log.debug("Destroyed input stream due to upload error.");
    }
    throw new Error(errorMsg);
  }
}
