import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Alert, CircularProgress, Paper, Typography } from "@mui/material";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import apiClient from "../api/ApiClient";
import { UploadedFile } from "../types/types";

interface FileUploadProps {
  connectionChecking: boolean;
  backendConnected: boolean;
  selectedFile: UploadedFile | null;
  onFileSelected: (file: UploadedFile) => void;
  fetchIfcElements: (modelId: string) => Promise<void>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  connectionChecking,
  backendConnected,
  onFileSelected,
  fetchIfcElements,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Function to upload IFC file to backend and select it
  const uploadAndSelectFile = useCallback(
    async (file: File): Promise<void> => {
      if (!backendConnected) {
        setUploadError("Backend nicht verbunden. Hochladen nicht möglich.");
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        // Derive project name from filename (remove extension)
        const projectName =
          file.name.replace(/\.ifc$/i, "") || "UnnamedProject";
        const timestamp = new Date().toISOString();

        // Pass all required arguments to uploadIFC
        const response = await apiClient.uploadIFC(
          file,
          projectName,
          file.name,
          timestamp
        );

        // Create the UploadedFile object
        const newFile: UploadedFile = {
          filename: file.name,
          created_at: new Date().toISOString(),
          modelId: response.model_id,
        };

        // Select the newly uploaded file to trigger element loading in MainPage
        onFileSelected(newFile);

        // Fetch elements using the main fetch function (optional, if uploadIFC doesn't trigger it)
        // await fetchIfcElements(response.model_id);
      } catch (error) {
        console.error("Error uploading IFC file:", error);
        setUploadError(
          `Fehler beim Hochladen der Datei: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        setIsUploading(false);
      }
    },
    [backendConnected, onFileSelected, fetchIfcElements]
  );

  const onDropFile = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        await uploadAndSelectFile(acceptedFiles[0]);
      }
    },
    [uploadAndSelectFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFile,
    multiple: false,
    accept: {
      "application/ifc": [".ifc"],
      "application/octet-stream": [".ifc"],
      "text/plain": [".ifc"],
    },
    disabled: isUploading, // Disable dropzone while uploading
  });

  return (
    <div className="mt-4">
      <Typography variant="h6" className="mb-2">
        Modell hochladen
      </Typography>

      {/* Main Dropzone */}
      <Paper
        {...getRootProps()}
        variant="outlined"
        sx={{
          p: 2,
          textAlign: "center",
          borderColor: isDragActive ? "primary.main" : "grey.400",
          borderStyle: "dashed",
          borderWidth: 2,
          mb: 3,
          cursor: isUploading ? "default" : "pointer",
          opacity: isUploading ? 0.6 : 1,
        }}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <div className="flex flex-col items-center justify-center">
            <CircularProgress size={24} sx={{ mb: 1 }} />
            <Typography variant="body2" color="textSecondary">
              Datei wird hochgeladen...
            </Typography>
          </div>
        ) : isDragActive ? (
          <>
            <UploadFileIcon fontSize="small" />
            <Typography variant="body2" color="primary">
              Datei hier ablegen...
            </Typography>
          </>
        ) : (
          <>
            <UploadFileIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="textPrimary">
              Datei hierher ziehen oder klicken
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Format: IFC
            </Typography>
          </>
        )}
      </Paper>

      {/* Display Upload Error */}
      {uploadError && (
        <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
          {uploadError}
        </Alert>
      )}

      {/* Backend Connection Status */}
      {connectionChecking && (
        <Alert
          severity="info"
          sx={{ mt: 2, mb: 2 }}
          icon={<CircularProgress size={20} />}
        >
          Verbinde mit Backend...
        </Alert>
      )}
      {!connectionChecking && !backendConnected && (
        <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
          Backend nicht erreichbar. Upload nicht möglich.
        </Alert>
      )}
    </div>
  );
};

export default FileUpload;
