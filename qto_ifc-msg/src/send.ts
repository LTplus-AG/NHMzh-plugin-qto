// This file is used to send the IFC file to the backend service

import { IFCData, JobAcceptedResponse } from "./types";
import { getEnv } from "./utils/env";
import { log } from "./utils/logger";
import FormData from "form-data";
import axios, { AxiosProgressEvent, AxiosResponse } from "axios";
import { Readable } from "stream";

const BACKEND_URL = getEnv("BACKEND_URL");
const UPLOAD_ENDPOINT = `${BACKEND_URL}/upload-ifc/`;

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
        validateStatus: function (status) {
          return status === 202; // Expect 202 Accepted
        },
      }
    );

    log.info(
      `File upload accepted by backend. Status: ${response.status}. Job ID: ${response.data.job_id}`
    );
    return response.data;
  } catch (error: any) {
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
        errorMsg = `No response received from backend for file submission: ${error.message}`;
        log.error(errorMsg, { requestDetails: error.request });
      } else {
        // Something happened in setting up the request
        errorMsg = `Error setting up file submission request: ${error.message}`;
        log.error(errorMsg);
      }
    } else {
      // Non-Axios error
      log.error(errorMsg, error);
    }
    // Ensure the stream is destroyed on error to prevent leaks
    if (ifcData.fileStream && !ifcData.fileStream.destroyed) {
      ifcData.fileStream.destroy(error);
      log.debug("Destroyed input stream due to upload error.");
    }
    throw new Error(errorMsg);
  }
}
