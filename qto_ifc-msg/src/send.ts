// This file is used to send the IFC file to the backend service

import { IFCData } from "./types";
import { getEnv } from "./utils/env";
import { log } from "./utils/logger";
import FormData from "form-data";
import axios, { AxiosProgressEvent } from "axios";
import { Readable } from "stream";

const BACKEND_URL = getEnv("BACKEND_URL");
const UPLOAD_ENDPOINT = `${BACKEND_URL}/upload-ifc/`;

export async function sendIFCFile(
  ifcData: IFCData,
  onProgress?: (progressEvent: AxiosProgressEvent) => void
) {
  try {
    log.info(
      `Preparing to send file stream ${ifcData.filename} to ${UPLOAD_ENDPOINT}`
    );

    const formData = new FormData();

    // Append the stream directly to FormData
    formData.append("file", ifcData.fileStream, {
      filename: ifcData.filename,
      contentType: "application/octet-stream", // Or the appropriate MIME type if known
    });

    // Append other metadata
    formData.append("project", ifcData.project);
    formData.append("filename", ifcData.filename);
    formData.append("timestamp", ifcData.timestamp);

    log.info(
      `Sending multipart stream request via Axios to ${UPLOAD_ENDPOINT}`
    );

    const response = await axios.post(UPLOAD_ENDPOINT, formData, {
      headers: {
        ...formData.getHeaders(), // Let FormData set the correct Content-Type and boundary
      },
      maxContentLength: Infinity, // Allow large uploads
      maxBodyLength: Infinity, // Allow large uploads
      onUploadProgress: onProgress, // Pass the callback here
    });

    log.info(
      `Received response with status: ${response.status} ${response.statusText}`
    );

    log.info(`File stream upload successful: ${ifcData.filename}`);
    return response.data;
  } catch (error: any) {
    let errorMsg = `Error sending file stream ${ifcData.filename}`;
    if (axios.isAxiosError(error) && error.response) {
      errorMsg = `Upload failed: ${error.response.status} ${
        error.response.statusText
      } - ${JSON.stringify(error.response.data)}`;
      log.error(errorMsg, error.response.data);
    } else {
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
