// This file is used to send the IFC file to the backend service

import { IFCData } from "./types";
import { getEnv } from "./utils/env";
import { log } from "./utils/logger";
import FormData from "form-data";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import axios from "axios";

const BACKEND_URL = getEnv("BACKEND_URL");
const UPLOAD_ENDPOINT = `${BACKEND_URL}/upload-ifc/`;

export async function sendIFCFile(ifcData: IFCData) {
  let tempFilePath: string | undefined;
  try {
    log.info(
      `Preparing to send file ${ifcData.filename} to ${UPLOAD_ENDPOINT}`
    );

    const formData = new FormData();

    const tempDir = os.tmpdir();
    const safeFilename = ifcData.filename.replace(/[^a-z0-9_.-]/gi, "_");
    tempFilePath = path.join(tempDir, `ifc_${Date.now()}_${safeFilename}`);

    fs.writeFileSync(tempFilePath, ifcData.file);
    log.info(`Written buffer to temporary file: ${tempFilePath}`);

    formData.append("file", fs.createReadStream(tempFilePath), {
      filename: ifcData.filename,
      contentType: "application/octet-stream",
    });

    formData.append("project", ifcData.project);
    formData.append("filename", ifcData.filename);
    formData.append("timestamp", ifcData.timestamp);

    log.info(`Sending multipart request via Axios to ${UPLOAD_ENDPOINT}`);

    const response = await axios.post(UPLOAD_ENDPOINT, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    log.info(
      `Received response with status: ${response.status} ${response.statusText}`
    );

    log.info(`File upload successful: ${ifcData.filename}`);
    return response.data;
  } catch (error: any) {
    let errorMsg = `Error sending file ${ifcData.filename}`;
    if (axios.isAxiosError(error) && error.response) {
      errorMsg = `Upload failed: ${error.response.status} ${
        error.response.statusText
      } - ${JSON.stringify(error.response.data)}`;
      log.error(errorMsg, error.response.data);
    } else {
      log.error(errorMsg, error);
    }
    throw new Error(errorMsg);
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        log.info(`Removed temporary file: ${tempFilePath}`);
      } catch (cleanupError: any) {
        log.warn(`Failed to clean up temp file: ${tempFilePath}`, cleanupError);
      }
    }
  }
}
