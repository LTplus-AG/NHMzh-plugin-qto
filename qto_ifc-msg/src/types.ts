import { Readable } from "stream";

export interface IFCData {
  project: string;
  filename: string;
  timestamp: string;
  fileStream: Readable;
  fileSize: number;
}

// Corresponds to JobAcceptedResponse in backend/models.py
export interface JobAcceptedResponse {
  message: string;
  job_id: string;
  status_endpoint: string;
}
