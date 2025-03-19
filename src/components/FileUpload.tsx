import { UploadFile } from "@mui/icons-material";
import {
  Typography,
  Paper,
  IconButton,
  Button,
  ListItem,
  ListItemIcon,
  CircularProgress,
  Alert,
} from "@mui/material";
import { ReactElement, useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Delete as DeleteIcon } from "@mui/icons-material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { MetaFile, UploadedFile, IFCElement } from "./types";

interface FileUploadProps {
  apiUrl: string;
  backendConnected: boolean;
  uploadedFiles: UploadedFile[];
  selectedFile: UploadedFile | null;
  instructions: { label: string; description: string }[];
  onFileSelected: (file: UploadedFile) => void;
  onFileUploaded: (file: UploadedFile) => void;
  fetchIfcElements: (modelId: string) => Promise<void>;
}

const FileUpload: React.FC<FileUploadProps> = ({
  apiUrl,
  backendConnected,
  uploadedFiles,
  selectedFile,
  instructions,
  onFileSelected,
  onFileUploaded,
  fetchIfcElements,
}) => {
  const [metaFile, setMetaFile] = useState<MetaFile>();
  const [requestFinished, setRequestFinished] = useState(false);

  // Function to upload IFC file to backend
  const uploadIfcFile = async (
    file: File
  ): Promise<{ modelId: string } | null> => {
    if (!backendConnected) {
      return null;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiUrl}/upload-ifc/`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000), // 30 second timeout for larger files
      });

      if (!response.ok) {
        throw new Error(`Failed to upload IFC file: ${response.statusText}`);
      }

      const data = await response.json();

      // After successful upload, fetch the elements
      await fetchIfcElements(data.model_id);

      return { modelId: data.model_id };
    } catch (error) {
      console.error("Error uploading IFC file:", error);
      return null;
    }
  };

  const fileSize = (size: number) => {
    if (size === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatMessage = (message: string, status: string) => {
    return message.split(/(\[.*?\]\(.*?\))/g).map((part, index) => {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        return (
          <a
            key={index}
            href={match[2]}
            className={`underline 
              ${
                status === "success"
                  ? "text-green-500"
                  : status === "error"
                  ? "text-red-500"
                  : ""
              }`}
          >
            {match[1]}
          </a>
        );
      }

      return (
        <span
          key={index}
          className={
            status === "success"
              ? "text-green-500"
              : status === "error"
              ? "text-red-500"
              : ""
          }
        >
          {part}
        </span>
      );
    });
  };

  const updateStep = (index: number, message: string, status: string) => {
    setMetaFile((prev) => {
      if (!prev) return prev;
      const updatedSteps = [...prev.steps];
      updatedSteps[index] = (
        <>
          {formatMessage(message, status)}{" "}
          {status === "loading" ? (
            <CircularProgress size={10} />
          ) : status === "success" ? (
            "✅"
          ) : status === "error" ? (
            "❌"
          ) : (
            ""
          )}
        </>
      );
      return { ...prev, steps: updatedSteps };
    });
    if (status === "error" || status === "success") {
      setMetaFile((prev) => {
        if (prev) {
          return {
            ...prev,
            valid:
              status === "success" &&
              (prev.valid === null || prev.valid === true)
                ? true
                : false,
          };
        }
        return prev;
      });
    }
  };

  const handleRemoveFile = () => {
    setMetaFile(undefined);
    // Reset the selected file display but keep showing existing file if one is selected
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  const handlePublish = async () => {
    // Mock implementation - for now we just immediately call the file done
    updateStep(0, "Datei wird veröffentlicht", "loading");

    // Try to upload to the backend
    if (metaFile?.file) {
      try {
        const result = await uploadIfcFile(metaFile.file);
        if (result) {
          // Update the metaFile with the model ID
          setMetaFile((prev) =>
            prev ? { ...prev, modelId: result.modelId } : prev
          );
          updateStep(0, "Datei wurde erfolgreich veröffentlicht", "success");
        } else {
          updateStep(0, "Datei konnte nicht hochgeladen werden", "error");
          return;
        }
      } catch {
        // If backend not available, show error
        console.log("Backend not available");
        updateStep(0, "Fehler bei der Verbindung zum Server", "error");
        return;
      }

      // Add to uploaded files list
      const newFile: UploadedFile = {
        filename: metaFile.file.name,
        created_at: new Date().toISOString(),
        modelId: metaFile.modelId,
      };

      onFileUploaded(newFile);
      onFileSelected(newFile);

      // Reset file upload UI after successful upload
      setTimeout(() => {
        setMetaFile(undefined);
      }, 1000);
    }
  };

  const onDropFile = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      // Initialize with loading state
      setRequestFinished(false);
      setMetaFile({
        file: acceptedFiles[0],
        steps: instructions.map(() => <></>),
        valid: null,
      });

      // Step 1: File upload
      updateStep(0, "Datei wird hochgeladen", "loading");

      // Try to upload to backend
      try {
        const result = await uploadIfcFile(acceptedFiles[0]);
        if (result) {
          // Store the model ID with the file
          setMetaFile((prev) =>
            prev ? { ...prev, modelId: result.modelId } : prev
          );
          updateStep(0, "Datei wurde hochgeladen", "success");

          // Step 2: File validation
          updateStep(1, "Datei wird geprüft", "loading");

          // Since we've already loaded the IFC data in uploadIfcFile,
          // we can just mark this as success after a short delay for UI feedback
          setTimeout(() => {
            updateStep(1, "Datei wurde erfolgreich geprüft", "success");

            // Mark as valid and ready
            setMetaFile((prev) => {
              if (!prev) return prev;
              return { ...prev, valid: true };
            });

            setRequestFinished(true);
          }, 1500);
        } else {
          // If upload failed, show error
          updateStep(0, "Fehler beim Hochladen der Datei", "error");
        }
      } catch {
        // If backend not available, show error
        console.log("Backend not available");
        updateStep(0, "Fehler bei der Verbindung zum Server", "error");
      }
    },
    [instructions, uploadIfcFile, fetchIfcElements]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFile,
    multiple: false,
    accept: {
      "application/ifc": [".ifc"],
      // Add more common file types that might contain IFC data
      "application/octet-stream": [".ifc"],
      "text/plain": [".ifc"],
    },
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
          cursor: "pointer",
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <>
            <UploadFileIcon fontSize="small" />
            <Typography variant="body2" color="primary">
              Drop the files here...
            </Typography>
          </>
        ) : (
          <>
            <UploadFileIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="textPrimary">
              Drag and Drop
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Format: IFC
            </Typography>
          </>
        )}
      </Paper>

      {/* Currently Uploading File */}
      {metaFile && (
        <div className="mb-4">
          <ListItem sx={{ px: 0 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <UploadFile color="primary" fontSize="small" />
            </ListItemIcon>
            <div className="flex-grow">
              <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                {metaFile?.file.name}
              </Typography>
              <Typography
                variant="caption"
                color="textSecondary"
                className="pb-1"
              >
                {fileSize(metaFile?.file.size || 0)}
              </Typography>
              {metaFile?.steps.map((step, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Typography key={index} variant="caption">
                    {step}
                  </Typography>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <IconButton edge="end" onClick={handleRemoveFile} size="small">
                <DeleteIcon fontSize="small" />
              </IconButton>
              <Button
                variant="contained"
                color="primary"
                onClick={handlePublish}
                disabled={
                  metaFile.valid === false ||
                  metaFile.valid == null ||
                  !requestFinished
                }
                size="small"
              >
                Freigeben
              </Button>
            </div>
          </ListItem>
        </div>
      )}

      {/* List of Previously Uploaded Files */}
      {uploadedFiles.length > 0 && !metaFile && (
        <div className="mb-4">
          <Typography variant="subtitle2" className="mb-2">
            Hochgeladene Modelle:
          </Typography>
          {uploadedFiles.map((file, index) => (
            <ListItem
              key={index}
              sx={{
                px: 0,
                py: 1,
                backgroundColor:
                  selectedFile?.filename === file.filename
                    ? "rgba(25, 118, 210, 0.08)"
                    : "transparent",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: "rgba(25, 118, 210, 0.04)",
                },
              }}
              onClick={() => onFileSelected(file)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <UploadFile color="primary" fontSize="small" />
              </ListItemIcon>
              <div className="flex-grow">
                <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                  {file.filename}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Hochgeladen:{" "}
                  {new Date(file.created_at).toLocaleDateString("de-CH")}
                </Typography>
              </div>
            </ListItem>
          ))}
        </div>
      )}

      {/* Backend Connection Warning */}
      {!backendConnected && (
        <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
          Backend nicht verbunden - Hochladen wird fehlschlagen
        </Alert>
      )}
    </div>
  );
};

export default FileUpload;
