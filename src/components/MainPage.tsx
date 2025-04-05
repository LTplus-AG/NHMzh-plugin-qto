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
} from "@mui/material";
import { useEffect, useState } from "react";
import apiClient, { IFCElement } from "../api/ApiClient";
import { UploadedFile } from "../types/types";
import FileUpload from "./FileUpload";
import { useElementEditing } from "./IfcElements/hooks/useElementEditing";
import IfcElementsList from "./IfcElementsList";

const MainPage = () => {
  // Removed unused Instructions array

  // Changed to underscore prefix to mark as intentionally partially used
  const [_uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);

  // IFC elements state
  const [ifcElements, setIfcElements] = useState<IFCElement[]>([]);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcError, setIfcError] = useState<string | null>(null);

  // Kafka send state
  const [kafkaSending, setKafkaSending] = useState<boolean>(false);
  const [kafkaSuccess, setKafkaSuccess] = useState<boolean | null>(null);
  const [kafkaError, setKafkaError] = useState<string | null>(null);

  // Backend connectivity state
  const [backendConnected, setBackendConnected] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);

  // State for confirmation dialog (keeping it for potential future use, but not triggered by main button now)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);

  // State for preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState<boolean>(false);

  // Use the element editing hook at the MainPage level so state is shared
  const { editedElements, editedElementsCount, handleAreaChange, resetEdits } =
    useElementEditing();

  // Add state to track if EBKP groups exist
  const [hasEbkpGroups, setHasEbkpGroups] = useState<boolean>(true); // Assume true initially

  // Add state for selected project
  const [selectedProject, setSelectedProject] = useState<string>("Projekt 1");

  // Check backend connectivity on load
  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  // Function to check if backend is available
  const checkBackendConnectivity = async () => {
    console.log("Checking backend connectivity");

    try {
      const healthData = await apiClient.getHealth();
      setBackendConnected(true);
      console.log("Backend connection successful");
      console.log(
        `Using ifcopenshell version: ${healthData.ifcopenshell_version}`
      );
    } catch (error) {
      console.warn("Backend connectivity check failed:", error);
      setBackendConnected(false);
      setShowConnectionError(true);
    } finally {
      setConnectionChecked(true);
    }
  };

  // Function to try to load the list of models from the backend on startup
  useEffect(() => {
    if (backendConnected) {
      loadModelsList();
    }
  }, [backendConnected]);

  // Function to load the list of available models from the backend
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

  // Function to fetch IFC elements for a specific model
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

      // First try to get QTO-formatted elements
      try {
        const qtoData = await apiClient.getQTOElements(modelId);
        console.log("Using QTO-formatted elements:", qtoData);

        // Enhanced debugging for classification data
        console.log("======= DETAILED EBKP CLASSIFICATION DEBUGGING =======");

        // Log the raw data structure of the first few elements
        if (qtoData.length > 0) {
          console.log(
            "First element raw data:",
            JSON.stringify(qtoData[0], null, 2)
          );

          // Add specific logging for classification fields
          const firstElement = qtoData[0];
          console.log("Classification data for first element:", {
            direct_ebkph: firstElement.ebkph,
            classification_object: firstElement.classification,
            classification_references: firstElement.classification_references,
            psets:
              firstElement.properties?.Pset_EBKP ||
              firstElement.properties?.["Pset_STLB"] ||
              "No EBKP/STLB psets found",
            has_properties: firstElement.properties
              ? Object.keys(firstElement.properties).length > 0
              : false,
            property_keys: firstElement.properties
              ? Object.keys(firstElement.properties)
              : [],
          });

          // Log all of the raw properties to find potential classification storage locations
          if (firstElement.properties) {
            console.log(
              "All properties of first element:",
              firstElement.properties
            );
          }

          // Check if there's any classification-related data in the raw element
          const potentialClassificationProps = Object.keys(firstElement).filter(
            (key) =>
              key.toLowerCase().includes("class") ||
              key.toLowerCase().includes("ebkp") ||
              key.toLowerCase().includes("reference")
          );

          if (potentialClassificationProps.length > 0) {
            console.log(
              "Potential classification properties found:",
              potentialClassificationProps
            );
            potentialClassificationProps.forEach((prop) => {
              console.log(`Value for ${prop}:`, firstElement[prop]);
            });
          }
        }

        // Add diagnostic logging for EBKP codes and area values
        const elementsWithEbkp = qtoData.filter(
          (el: any) => el.ebkph || el.classification?.id
        );
        console.log(
          `Found ${elementsWithEbkp.length}/${qtoData.length} elements with EBKP codes`
        );
        if (elementsWithEbkp.length > 0) {
          console.log("Sample EBKP elements:", elementsWithEbkp.slice(0, 3));
        } else {
          console.log(
            "NO ELEMENTS WITH EBKP FOUND - checking for alternative classification sources"
          );

          // Check for additional classification sources (modified to check more possibilities)
          const elementsWithAnyClassification = qtoData.filter(
            (el: any) =>
              el.classification ||
              el.classification_references ||
              el.has_references ||
              (el.classification?.name && !el.classification?.id) || // Elements with name but no ID
              el.properties?.Pset_EBKP ||
              el.properties?.["Pset_STLB"] ||
              el.properties?.["ePset_Klassifikation"] ||
              el.properties?.["Classification"] ||
              el.properties?.["EBKP"] ||
              (el.properties &&
                Object.keys(el.properties).some(
                  (key) =>
                    key.includes("EBKP") ||
                    key.includes("Class") ||
                    key.includes("class")
                ))
          );

          console.log(
            `Found ${elementsWithAnyClassification.length}/${qtoData.length} elements with any classification data`
          );

          if (elementsWithAnyClassification.length > 0) {
            console.log(
              "Sample elements with alternative classification:",
              elementsWithAnyClassification.slice(0, 3).map((el) => ({
                id: el.id,
                category: el.category,
                classification: el.classification,
                classification_references: el.classification_references,
                has_references: el.has_references,
                relevant_psets: {
                  Pset_EBKP: el.properties?.Pset_EBKP,
                  Pset_STLB: el.properties?.["Pset_STLB"],
                  ePset_Klassifikation: el.properties?.["ePset_Klassifikation"],
                  Classification: el.properties?.["Classification"],
                  EBKP: el.properties?.["EBKP"],
                  // Check for other potential classification properties
                  classification_props: el.properties
                    ? Object.keys(el.properties)
                        .filter(
                          (key) =>
                            key.includes("EBKP") ||
                            key.includes("Class") ||
                            key.includes("class")
                        )
                        .reduce((obj: Record<string, any>, key) => {
                          if (
                            el.properties &&
                            el.properties.hasOwnProperty(key)
                          ) {
                            obj[key] = el.properties[key];
                          }
                          return obj;
                        }, {} as Record<string, any>)
                    : {},
                },
              }))
            );

            // Generate a fix suggestion by extracting classification names
            if (
              elementsWithAnyClassification.every(
                (el) => el.classification?.name && !el.classification?.id
              )
            ) {
              console.log(
                "SUGGESTION: All elements have classification names but no IDs. This may indicate the IFC model has classifications but the ID field is empty."
              );

              // Sample of classification names to help identify patterns
              const classificationNames = [
                ...new Set(
                  elementsWithAnyClassification
                    .slice(0, 20)
                    .map((el) => el.classification?.name)
                    .filter(Boolean)
                ),
              ];

              console.log(
                "Sample of classification names:",
                classificationNames
              );
              console.log(
                "BACKEND FIX: The backend should extract EBKP codes from IfcClassificationReference entities using the ifcopenshell.api.classification module."
              );
            }
          }
        }

        const elementsWithArea = qtoData.filter(
          (el: any) => el.area && el.area > 0
        );
        console.log(
          `Found ${elementsWithArea.length}/${qtoData.length} elements with non-zero area values`
        );
        if (elementsWithArea.length > 0) {
          console.log(
            "Sample elements with area:",
            elementsWithArea.slice(0, 3)
          );
        }

        // Map QTO elements format to IFCElement format
        interface QTOElement {
          id: string;
          category: string;
          level: string;
          area: number;
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
          // Try to extract a classification ID from various sources
          // 1. Standard classification ID
          // 2. EBKPH field
          // 3. If name exists but ID is null, try to derive an ID from the name
          let classificationId = el.classification?.id || el.ebkph || null;

          // If we have a classification name but no ID, we could try to derive an ID
          if (!classificationId && el.classification?.name) {
            // Log this case for debugging
            console.log(
              `Element ${el.id} has classification name "${el.classification.name}" but no ID`
            );

            // Example: we could try to assign a default ID based on name pattern, but this is just for testing
            // In practice, this should be handled on the backend by properly extracting IDs from IfcClassificationReference

            // For example, if the name looks like a EBKP classification name, we could use a pattern
            if (
              el.classification.name.includes("wand") ||
              el.classification.name.includes("Wand")
            ) {
              // This is just an example - not a real implementation
              console.log(
                `  Potential derived ID for "${el.classification.name}" might be something like "C4.13" (walls)`
              );
            }
          }

          // Convert materials array to material_volumes object format
          const material_volumes: Record<string, any> = {};
          if (el.materials && el.materials.length > 0) {
            // Log the materials to verify they have fraction values
            console.log(
              `Element ${el.id} has ${el.materials.length} materials`
            );
            if (el.materials.length > 0) {
              console.log("First material sample:", el.materials[0]);
            }

            // Convert materials array to material_volumes format
            el.materials.forEach((mat, index) => {
              const materialName = mat.name;
              // If material name already exists, add an index suffix
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
            global_id: el.id, // Use id as global_id for compatibility
            type: el.category,
            name: el.category,
            description: null,
            properties: el.properties || {},
            material_volumes:
              Object.keys(material_volumes).length > 0
                ? material_volumes
                : null,
            // QTO specific fields
            category: el.category,
            level: el.level,
            area: el.area,
            is_structural: el.is_structural,
            is_external: el.is_external,
            ebkph: el.ebkph,
            materials: el.materials,
            // Map classification data if available
            classification_id: classificationId,
            classification_name: el.classification?.name || null,
            classification_system: el.classification?.system || "EBKP",
          };
        });

        console.log("======= END OF EBKP CLASSIFICATION DEBUGGING =======");

        // Add a final check of the mapped elements to verify classification data
        if (mappedElements.length > 0) {
          const elementsWithClassificationName = mappedElements.filter(
            (el) => el.classification_name
          );
          const elementsWithClassificationId = mappedElements.filter(
            (el) => el.classification_id
          );

          console.log(
            `After mapping: ${elementsWithClassificationName.length}/${mappedElements.length} elements have classification names`
          );
          console.log(
            `After mapping: ${elementsWithClassificationId.length}/${mappedElements.length} elements have classification IDs`
          );

          if (
            elementsWithClassificationName.length > 0 &&
            elementsWithClassificationId.length === 0
          ) {
            console.log(
              "ISSUE DETECTED: All elements with classifications are missing IDs"
            );
            console.log(
              "This likely requires a fix in the backend to properly extract classification IDs from the IFC model"
            );
            console.log(
              "Using the ifcopenshell.api.classification module to access IfcClassificationReference entities"
            );
          }
        }

        setIfcElements(mappedElements);
        setIfcLoading(false);
        return;
      } catch (qtoError) {
        console.warn(
          "Error fetching QTO elements, falling back to standard IFC elements:",
          qtoError
        );
      }

      // Fallback to standard IFC elements if QTO endpoint fails
      const elements = await apiClient.getIFCElements(modelId);
      setIfcElements(elements);
    } catch (error) {
      console.error(`Error fetching IFC elements for model ${modelId}:`, error);
      setIfcError(
        "Could not load IFC elements from server. Please try uploading the file again."
      );
    } finally {
      setIfcLoading(false);
    }
  };

  // Handlers for FileUpload component
  const handleFileSelected = (file: UploadedFile) => {
    setSelectedFile(file);

    // If the file has a modelId, fetch its IFC elements
    if (file.modelId && backendConnected) {
      fetchIfcElements(file.modelId);
    } else {
      setIfcError(
        "No model ID associated with this file or backend not connected."
      );
    }
  };

  // Function to send QTO data to Database (formerly Kafka)
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

      // First check if the model is still available on the server
      try {
        await apiClient.getIFCElements(selectedFile.modelId);
      } catch (checkError) {
        // If the model is not found, try to reload the model list
        await loadModelsList();
        throw new Error(
          "Model not found on server. It may have been deleted or the server was restarted."
        );
      }

      // Apply user edits to elements before sending to database
      const updatedElements = ifcElements.map((element) => {
        // Check if this element has been edited by the user and the key exists
        if (editedElements.hasOwnProperty(element.id)) {
          const edited = editedElements[element.id];
          if (
            edited &&
            edited.newArea !== null &&
            edited.newArea !== undefined
          ) {
            // Create a deep copy of the element to modify
            const updatedElement = JSON.parse(JSON.stringify(element));

            // Ensure area is stored as a number, not a string
            const numericArea =
              typeof edited.newArea === "string"
                ? parseFloat(edited.newArea)
                : edited.newArea;

            // Store the original area value - use the original value from editedElements
            // since that's what was stored when the edit was first made
            updatedElement.original_area = edited.originalArea;

            // Log the original and new values for debugging
            console.log(
              `Element ${element.id} saving original area: ${edited.originalArea} (from edit tracking)`
            );

            // Update the area with the new value
            updatedElement.area = numericArea;

            console.log(
              `Element ${element.id} area updated from ${updatedElement.original_area} to ${numericArea}`
            );
            return updatedElement;
          }
        }
        return element;
      });

      // Log the edited elements count to verify edits are being tracked
      const editedCount = Object.keys(editedElements).length;
      console.log(`Sending ${editedCount} edited elements to backend`);
      if (editedCount > 0) {
        console.log("Edited elements:", editedElements);
      }

      // Get the actual project name from the selected project (removing the "Projekt X: " prefix)
      const projectName =
        selectedProject === "Projekt 1"
          ? "Recyclingzentrum Juch-Areal"
          : selectedProject === "Projekt 2"
          ? "Gesamterneuerung Stadthausanlage"
          : selectedProject === "Projekt 3"
          ? "Amtshaus Walche"
          : "Gemeinschaftszentrum Wipkingen";

      console.log(`Using project from sidebar: ${projectName}`);

      // Use the API client to send the updated elements to the backend
      // Pass the selected project name from the sidebar dropdown
      const response = await apiClient.sendQTO(
        selectedFile.modelId,
        updatedElements,
        projectName // Pass the actual project name
      );
      console.log("QTO data sent successfully to database:", response);
      setKafkaSuccess(true);
    } catch (error) {
      console.error("Error sending QTO data to database:", error);
      setKafkaError(
        `Error sending QTO data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setKafkaSuccess(false);
    } finally {
      setKafkaSending(false);
      setPreviewDialogOpen(false); // Close the preview dialog after sending
    }
  };

  // Handler for closing confirmation dialog - needed by the dialog component
  const handleCloseConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };

  // Open preview dialog
  const handleOpenPreviewDialog = () => {
    setPreviewDialogOpen(true);
  };

  // Close preview dialog
  const handleClosePreviewDialog = () => {
    setPreviewDialogOpen(false);
  };

  // Handle closing the connection error snackbar
  const handleCloseConnectionError = () => {
    setShowConnectionError(false);
  };

  // Handle closing the kafka result snackbar
  const handleCloseKafkaSnackbar = () => {
    setKafkaSuccess(null);
    setKafkaError(null);
  };

  return (
    <div className="w-full flex h-full">
      {/* Backend Connection Error Snackbar */}
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
          {/* Removed IFC Elemente Title */}

          {/* Info section - model info and alerts */}
          <Box
            display="flex"
            flexDirection={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
            mb={4}
            className="flex flex-col md:flex-row w-full"
          >
            {/* Left side: Active model info */}
            {selectedFile && (
              <div className="font-medium flex items-center mb-2 md:mb-0 max-w-full">
                <span className="whitespace-nowrap mr-1">Aktives Modell:</span>
                <span className="truncate max-w-[200px] md:max-w-[300px] font-bold">
                  {selectedFile.filename}
                </span>
                <Tooltip
                  title={
                    <>
                      <div>
                        Hochgeladen:{" "}
                        {new Date(selectedFile.created_at).toLocaleString(
                          "de-CH"
                        )}
                      </div>
                      <div>Elemente: {ifcElements.length}</div>
                    </>
                  }
                  arrow
                >
                  <IconButton size="small" sx={{ ml: 0.5 }}>
                    <InfoIcon fontSize="inherit" color="action" />
                  </IconButton>
                </Tooltip>
              </div>
            )}
            {/* Placeholder if no file selected to maintain layout */}
            {!selectedFile && <div />}

            {/* Right side: Action buttons */}
            {selectedFile && (
              <div className="flex gap-2 self-start md:self-center mt-2 md:mt-0">
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
                  sx={{ minWidth: "max-content" }}
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
                    sx={{ minWidth: "max-content" }}
                  >
                    {kafkaSending ? "Senden..." : "Vorschau anzeigen"}
                  </Button>
                )}
              </div>
            )}
            {/* Placeholder if no file selected to maintain layout */}
            {!selectedFile && <div />}
          </Box>

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
              handleAreaChange={handleAreaChange}
              resetEdits={resetEdits}
              // Pass callback to update EBKP status
              onEbkpStatusChange={setHasEbkpGroups}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
