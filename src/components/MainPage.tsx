import InfoIcon from "@mui/icons-material/Info";
import SendIcon from "@mui/icons-material/Send";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormLabel,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Tooltip,
  Typography,
  Badge,
} from "@mui/material";
import { useEffect, useState } from "react";
import apiClient from "../api/ApiClient";
import { UploadedFile } from "../types/types";
import FileUpload from "./FileUpload";
import { useElementEditing } from "./IfcElements/hooks/useElementEditing";
import IfcElementsList from "./IfcElementsList";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

const MainPage = () => {
  const [_uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [ifcElements, setIfcElements] = useState<any[]>([]);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcError, setIfcError] = useState<string | null>(null);
  const [kafkaSending, setKafkaSending] = useState<boolean>(false);
  const [kafkaSuccess, setKafkaSuccess] = useState<boolean | null>(null);
  const [kafkaError, setKafkaError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState<boolean>(false);
  const [hasEbkpGroups, setHasEbkpGroups] = useState<boolean>(true);
  const [selectedProject, setSelectedProject] = useState<string>("Projekt 1");

  const {
    editedElements,
    editedElementsCount,
    handleQuantityChange,
    handleAreaChange,
    resetEdits,
  } = useElementEditing();

  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  const checkBackendConnectivity = async () => {
    try {
      const healthData = await apiClient.getHealth();
      setBackendConnected(true);
    } catch (error) {
      setBackendConnected(false);
      setShowConnectionError(true);
    } finally {
      setConnectionChecked(true);
    }
  };

  useEffect(() => {
    if (backendConnected) {
      loadModelsList();
    }
  }, [backendConnected]);

  const loadModelsList = async () => {
    try {
      const models = await apiClient.listModels();
      if (models.length > 0) {
        const modelFiles: UploadedFile[] = models.map((model) => ({
          filename: model.filename,
          created_at: new Date().toISOString(),
          modelId: model.model_id,
        }));
        setUploadedFiles(modelFiles);
      }
    } catch (error) {
      console.error("Error loading models list:", error);
    }
  };

  const fetchIfcElements = async (modelId: string) => {
    if (!backendConnected || !modelId) {
      setIfcError(
        "Backend is not connected. Please make sure the server is running."
      );
      return;
    }

    try {
      setIfcLoading(true);
      setIfcError(null);

      try {
        const qtoData = await apiClient.getQTOElements(modelId);

        interface QTOElement {
          id: string;
          category: string;
          level: string;
          area: number;
          length?: number;
          is_structural: boolean;
          is_external: boolean;
          ebkph: string;
          materials: Array<{
            name: string;
            fraction?: number;
            volume?: number;
            unit?: string;
          }>;
          classification?: {
            id: string;
            name: string;
            system: string;
          };
          classification_references?: Array<any>;
          has_references?: boolean;
          properties?: Record<string, any>;
        }

        const mappedElements = qtoData.map((el: QTOElement) => {
          let classificationId = el.classification?.id || el.ebkph || null;

          const material_volumes: Record<string, any> = {};
          if (el.materials && el.materials.length > 0) {
            el.materials.forEach((mat, index) => {
              const materialName = mat.name;
              const uniqueName = material_volumes[materialName]
                ? `${materialName} (${index})`
                : materialName;

              material_volumes[uniqueName] = {
                volume: mat.volume,
                fraction: mat.fraction,
              };
            });
          }

          return {
            id: el.id,
            global_id: el.id,
            type: el.category,
            name: el.category,
            description: null,
            properties: el.properties || {},
            material_volumes:
              Object.keys(material_volumes).length > 0
                ? material_volumes
                : null,
            category: el.category,
            level: el.level,
            area: el.area,
            length: el.length,
            is_structural: el.is_structural,
            is_external: el.is_external,
            ebkph: el.ebkph,
            materials: el.materials,
            classification_id: classificationId,
            classification_name: el.classification?.name || null,
            classification_system: el.classification?.system || "EBKP",
          };
        });

        setIfcElements(mappedElements as any);
        setIfcLoading(false);
        return;
      } catch (qtoError) {
        // Fallback to standard IFC elements if QTO endpoint fails
        const elements = await apiClient.getIFCElements(modelId);
        setIfcElements(elements);
      }
    } catch (error) {
      setIfcError(
        "Could not load IFC elements from server. Please try uploading the file again."
      );
    } finally {
      setIfcLoading(false);
    }
  };

  const handleFileSelected = (file: UploadedFile) => {
    setSelectedFile(file);
    if (file.modelId && backendConnected) {
      fetchIfcElements(file.modelId);
    } else {
      setIfcError(
        "No model ID associated with this file or backend not connected."
      );
    }
  };

  const sendQtoToDatabase = async () => {
    if (!selectedFile?.modelId) {
      setKafkaError("No model is selected");
      setKafkaSuccess(false);
      return;
    }

    if (ifcElements.length === 0) {
      setKafkaError("No elements found in model. Please reload the model.");
      setKafkaSuccess(false);
      return;
    }

    try {
      setKafkaSending(true);
      setKafkaError(null);
      setKafkaSuccess(null);

      try {
        await apiClient.getIFCElements(selectedFile.modelId);
      } catch (checkError) {
        await loadModelsList();
        throw new Error(
          "Model not found on server. It may have been deleted or the server was restarted."
        );
      }

      const updatedElements = ifcElements.map((element) => {
        if (editedElements.hasOwnProperty(element.id)) {
          const edited = editedElements[element.id];
          if (
            edited &&
            edited.newArea !== null &&
            edited.newArea !== undefined
          ) {
            const updatedElement = JSON.parse(JSON.stringify(element));
            const numericArea =
              typeof edited.newArea === "string"
                ? parseFloat(edited.newArea)
                : edited.newArea;
            updatedElement.original_area = edited.originalArea;
            updatedElement.area = numericArea;
            return updatedElement;
          }
        }
        return element;
      });

      const projectName =
        selectedProject === "Projekt 1"
          ? "Recyclingzentrum Juch-Areal"
          : selectedProject === "Projekt 2"
          ? "Gesamterneuerung Stadthausanlage"
          : selectedProject === "Projekt 3"
          ? "Amtshaus Walche"
          : "Gemeinschaftszentrum Wipkingen";

      const response = await apiClient.sendQTO(
        selectedFile.modelId,
        updatedElements,
        projectName
      );
      setKafkaSuccess(true);
    } catch (error) {
      setKafkaError(
        `Error sending QTO data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setKafkaSuccess(false);
    } finally {
      setKafkaSending(false);
      setPreviewDialogOpen(false);
    }
  };

  const handleCloseConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleOpenPreviewDialog = () => {
    setPreviewDialogOpen(true);
  };

  const handleClosePreviewDialog = () => {
    setPreviewDialogOpen(false);
  };

  const handleCloseConnectionError = () => {
    setShowConnectionError(false);
  };

  const handleCloseKafkaSnackbar = () => {
    setKafkaSuccess(null);
    setKafkaError(null);
  };

  return (
    <div className="w-full flex h-full">
      <Snackbar
        open={showConnectionError}
        autoHideDuration={6000}
        onClose={handleCloseConnectionError}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseConnectionError}
          severity="warning"
          sx={{ width: "100%" }}
        >
          Backend server connection failed. Please make sure the server is
          running.
        </Alert>
      </Snackbar>

      {/* Kafka Send Result Snackbar */}
      <Snackbar
        open={kafkaSuccess !== null || kafkaError !== null}
        autoHideDuration={6000}
        onClose={handleCloseKafkaSnackbar}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseKafkaSnackbar}
          severity={kafkaSuccess ? "success" : "error"}
          sx={{ width: "100%" }}
        >
          {kafkaSuccess
            ? "QTO data successfully sent to database"
            : kafkaError || "Error sending QTO data"}
        </Alert>
      </Snackbar>

      {/* Confirmation Dialog (kept for potential future use) */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCloseConfirmDialog}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Confirm Data Submission"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to send the QTO data to the database? This
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirmDialog} color="primary">
            Cancel
          </Button>
          <Button onClick={sendQtoToDatabase} color="primary" autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={handleClosePreviewDialog}
        aria-labelledby="preview-dialog-title"
        maxWidth="md" // Use a wider dialog for the preview table
        fullWidth
      >
        <DialogTitle id="preview-dialog-title">
          Vorschau der zu sendenden Daten
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div" id="preview-dialog-description">
            <Typography variant="body1" gutterBottom>
              Bitte überprüfen Sie die folgenden Daten vor dem Senden:
            </Typography>
            <Typography variant="body2">
              Projekt: <strong>{selectedProject}</strong>
            </Typography>
            <Typography variant="body2">
              Datei: <strong>{selectedFile?.filename}</strong>
            </Typography>
            <Typography variant="body2">
              Anzahl Elemente: <strong>{ifcElements.length}</strong>
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Anzahl bearbeitete Elemente:{" "}
              <strong>{editedElementsCount}</strong>
            </Typography>
            {/* TODO: Add a small preview table/list here if needed for more detail */}
            <Typography variant="caption">
              (Hinweis: Eine detaillierte Elementvorschau ist hier nicht
              implementiert, nur eine Zusammenfassung.)
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePreviewDialog} color="primary">
            Abbrechen
          </Button>
          <Button
            onClick={sendQtoToDatabase}
            color="primary"
            disabled={kafkaSending}
            autoFocus
          >
            {kafkaSending ? "Senden..." : "Senden"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sidebar */}
      <div className="w-1/4 p-8 bg-light text-primary flex flex-col">
        {/* Header und Inhalte */}
        <div className="flex flex-col">
          <Typography variant="h3" color="primary" sx={{ mb: 2 }}>
            Mengen
          </Typography>
          <div className="flex flex-col mt-2 gap-1">
            <FormLabel focused htmlFor="select-project">
              Projekt:
            </FormLabel>
            <FormControl variant="outlined" focused>
              <Select
                id="select-project"
                size="small"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value as string)}
                labelId="select-project"
              >
                <MenuItem value={"Projekt 1"}>
                  Recyclingzentrum Juch-Areal
                </MenuItem>
                <MenuItem value={"Projekt 2"}>
                  Gesamterneuerung Stadthausanlage
                </MenuItem>
                <MenuItem value={"Projekt 3"}>Amtshaus Walche</MenuItem>
                <MenuItem value={"Projekt 4"}>
                  Gemeinschaftszentrum Wipkingen
                </MenuItem>
              </Select>
            </FormControl>
          </div>
        </div>

        {/* Backend Status Indicator */}
        {connectionChecked && (
          <div className="mt-2 px-2 py-1 text-xs flex items-center">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                backendConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
            <span>
              {backendConnected
                ? "Backend connected"
                : "Backend not available - IFC processing will fail"}
            </span>
          </div>
        )}

        {/* File Upload Component */}
        <FileUpload
          backendConnected={backendConnected}
          selectedFile={selectedFile}
          onFileSelected={handleFileSelected}
          fetchIfcElements={fetchIfcElements}
        />

        {/* Fusszeile */}
        <div className="flex flex-col mt-auto">
          {/* Removed Anleitung Section */}
        </div>
      </div>

      {/* Main content area - IFC Elements */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="p-10 flex flex-col flex-grow">
          {/* Model information header */}
          {selectedFile && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                mb: 3,
                borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
                pb: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  mb: 1,
                }}
              >
                {/* Model title & stats */}
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography variant="h5" component="h1" fontWeight="bold">
                    {selectedFile.filename}
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      mt: 1,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Hochgeladen:{" "}
                      {new Date(selectedFile.created_at).toLocaleString(
                        "de-CH"
                      )}
                    </Typography>
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {ifcElements.length} Elemente
                      </Typography>

                      {TARGET_IFC_CLASSES && TARGET_IFC_CLASSES.length > 0 && (
                        <Tooltip
                          title={
                            <div>
                              <p>
                                Nur folgende IFC-Klassen werden berücksichtigt:
                              </p>
                              <ul
                                style={{ margin: "8px 0", paddingLeft: "20px" }}
                              >
                                {TARGET_IFC_CLASSES.map((cls: string) => (
                                  <li key={cls}>{cls}</li>
                                ))}
                              </ul>
                            </div>
                          }
                          arrow
                        >
                          <IconButton size="small" sx={{ p: 0 }}>
                            <InfoIcon fontSize="small" color="action" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Action buttons */}
                <Box sx={{ display: "flex", gap: 2 }}>
                  {/* Reload Button */}
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={() =>
                      selectedFile.modelId &&
                      fetchIfcElements(selectedFile.modelId)
                    }
                    disabled={ifcLoading || !backendConnected}
                    className="text-primary border-primary whitespace-nowrap"
                    size="small"
                  >
                    {ifcLoading ? "Lädt..." : "Modell neu laden"}
                  </Button>

                  {/* Preview Button (formerly Send to Database) */}
                  {ifcElements.length > 0 && (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<SendIcon />}
                      onClick={handleOpenPreviewDialog}
                      disabled={
                        kafkaSending || !backendConnected || !hasEbkpGroups
                      }
                      className="bg-primary whitespace-nowrap"
                      size="small"
                    >
                      {kafkaSending ? "Senden..." : "Vorschau anzeigen"}
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          )}

          {/* Message when no IFC file is loaded */}
          {!ifcLoading && ifcElements.length === 0 && !ifcError && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Bitte laden Sie eine IFC-Datei hoch, um die Daten anzuzeigen. Die
              IFC-Elemente werden mit ifcopenshell 0.8.1 verarbeitet.
            </Alert>
          )}

          {/* Element list container - expanded to fill remaining space */}
          <div className="border border-gray-200 rounded-md flex-grow flex flex-col">
            <IfcElementsList
              elements={ifcElements}
              loading={ifcLoading}
              error={ifcError}
              editedElements={editedElements}
              editedElementsCount={editedElementsCount}
              handleQuantityChange={handleQuantityChange}
              resetEdits={resetEdits}
              // Pass callback to update EBKP status
              onEbkpStatusChange={setHasEbkpGroups}
              targetIfcClasses={TARGET_IFC_CLASSES}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
