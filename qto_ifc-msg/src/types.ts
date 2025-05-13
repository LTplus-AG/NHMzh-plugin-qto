import { Readable } from "stream";

export interface IFCData {
  project: string;
  filename: string;
  timestamp: string;
  fileStream: Readable;
}
