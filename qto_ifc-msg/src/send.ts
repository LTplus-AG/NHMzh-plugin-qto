// This file is used to send the IFC file to the backend service

import { IFCData } from "./types";
import { getEnv } from "./utils/env";

const BACKEND_URL = getEnv("BACKEND_URL");
const UPLOAD_ENDPOINT = `${BACKEND_URL}/upload-ifc`;

export async function sendIFCFile(ifcData: IFCData) {
	// Create a FormData object
	const formData = new FormData();

	// Convert Buffer to Blob for file upload
	const fileBlob = new Blob([ifcData.file], { type: "application/x-step" });

	// Add the file with its original filename
	formData.append("file", fileBlob, ifcData.filename);

	// Add metadata as separate form fields
	formData.append("project", ifcData.project);
	formData.append("filename", ifcData.filename);
	formData.append("timestamp", ifcData.timestamp);

	const response = await fetch(UPLOAD_ENDPOINT, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(errorData.detail || "Upload failed");
	}

	return response.json();
}
