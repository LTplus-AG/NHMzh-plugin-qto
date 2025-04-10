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
import apiClient, { IFCElement as ApiIFCElement } from "../api/ApiClient";
import { IFCElement as LocalIFCElement } from "../types/types";
import { useElementEditing } from "./IfcElements/hooks/useElementEditing";
import IfcElementsList from "./IfcElementsList";
import { QtoPreviewDialog } from "./QtoPreviewDialog";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

const MainPage = () => {
  const [ifcElements, setIfcElements] = useState<LocalIFCElement[]>([]);
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
  const [selectedProject, setSelectedProject] = useState<string>(
    "Recyclingzentrum Juch-Areal"
  );
  const [viewType, setViewType] = useState<string>("individual");

  const {
    editedElements,
    editedElementsCount,
    handleQuantityChange,
    resetEdits,
  } = useElementEditing();

  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  const checkBackendConnectivity = async (retries = 5) => {
    try {
      await apiClient.getHealth();
      setBackendConnected(true);
      setConnectionChecked(true);
      setShowConnectionError(false);
    } catch (error) {
      if (retries > 0) {
        console.warn(
          `Backend health check failed. Retrying in 4 seconds... (${retries} retries left)`
        );
        setTimeout(() => checkBackendConnectivity(retries - 1), 4000);
      } else {
        console.error(
          "Backend health check failed after multiple retries.",
          error
        );
        setBackendConnected(false);
        setShowConnectionError(true);
        setConnectionChecked(true);
      }
    }
  };

  useEffect(() => {
    if (selectedProject && backendConnected) {
      fetchProjectElements(selectedProject);
      resetEdits();
    } else {
      setIfcElements([]);
      setIfcError(null);
    }
  }, [selectedProject, backendConnected]);

  const fetchProjectElements = async (projectName: string) => {
    setIfcLoading(true);
    setIfcError(null);
    try {
      const elementsFromApi: ApiIFCElement[] =
        await apiClient.getProjectElements(projectName);

      // If we got empty results, don't clear existing elements
      if (elementsFromApi.length === 0) {
        console.log(
          `No elements found for project '${projectName}'. Using previously loaded data if available.`
        );
        setIfcLoading(false);
        return;
      }

      const mappedElements: LocalIFCElement[] = elementsFromApi.map(
        (apiElement: ApiIFCElement) => ({
          id: apiElement.id,
          global_id: apiElement.global_id,
          type: apiElement.type,
          name: apiElement.name,
          type_name: (apiElement as any).type_name,
          description: apiElement.description,
          properties: apiElement.properties,
          material_volumes: apiElement.material_volumes,
          level: apiElement.level,
          classification_id: apiElement.classification_id,
          classification_name: apiElement.classification_name,
          classification_system: apiElement.classification_system,
          area: apiElement.area,
          length: apiElement.length,
          volume: apiElement.volume?.net ?? apiElement.volume?.gross,
          category: apiElement.category,
          is_structural: apiElement.is_structural,
          is_external: apiElement.is_external,
          ebkph: apiElement.ebkph,
          materials: apiElement.materials,
          classification: {
            id: apiElement.classification_id,
            name: apiElement.classification_name,
            system: apiElement.classification_system,
          },
        })
      );

      setIfcElements(mappedElements);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("Not Found")) {
        console.log(
          `Parsed element data for project '${projectName}' not found. Using previously loaded data if available.`
        );
      } else {
        console.error(
          `Error fetching elements for project ${projectName}:`,
          error
        );
        setIfcError(
          `Could not load elements for project ${projectName}. Please check backend connection and logs.`
        );
        // Don't clear existing elements on error
        // setIfcElements([]);
      }
    } finally {
      setIfcLoading(false);
    }
  };

  const sendQtoToDatabase = async () => {
    console.warn("sendQtoToDatabase needs refactoring or removal.");
    // if (!selectedProject) {
    //   setKafkaError("No project is selected");
    //   setKafkaSuccess(false);
    //   return;
    // }
    // ... (rest of the logic needs rethinking - e.g., how to get updated elements?)
    // Let's comment out the core logic for now to remove lint errors
    /*
    if (ifcElements.length === 0) {
      setKafkaError("No elements found in project. Please reload the project.");
      setKafkaSuccess(false);
      return;
    }

    try {
      setKafkaSending(true);
      setKafkaError(null);
      setKafkaSuccess(null);

      // How to check if project exists on backend? Maybe not needed.

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

      // Sending QTO manually might not fit the new flow perfectly.
      // The backend now sends automatically after processing.
      // This button might need to become a "Reprocess" button if needed.
      // For now, simulate success without calling the removed API method.
      // await apiClient.sendQTO(...);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
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
    */
  };

  const handleCloseConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleOpenPreviewDialog = () => {
    console.log("Preview/Send button clicked - functionality needs review.");
    setKafkaError(
      "Manual sending function needs refactoring for new workflow."
    );
    // setPreviewDialogOpen(true);
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
    <div className="w-full flex h-full" style={{ width: "100%" }}>
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

      <div className="w-1/4 p-8 bg-light text-primary flex flex-col">
        <div className="flex flex-col">
          <Typography variant="h3" color="primary" sx={{ mb: 2 }}>
            Mengen
          </Typography>
          <div className="flex flex-col mt-2 gap-1">
            <FormLabel focused htmlFor="select-project">
              Projekt:
            </FormLabel>
            <FormControl variant="outlined" focused fullWidth>
              <Select
                id="select-project"
                size="small"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value as string)}
                labelId="select-project"
              >
                <MenuItem value={"Recyclingzentrum Juch-Areal"}>
                  Recyclingzentrum Juch-Areal
                </MenuItem>
                <MenuItem value={"Gesamterneuerung Stadthausanlage"}>
                  Gesamterneuerung Stadthausanlage
                </MenuItem>
                <MenuItem value={"Amtshaus Walche"}>Amtshaus Walche</MenuItem>
                <MenuItem value={"Gemeinschaftszentrum Wipkingen"}>
                  Gemeinschaftszentrum Wipkingen
                </MenuItem>
              </Select>
            </FormControl>
          </div>
        </div>

        <div className="flex flex-col mt-auto">
          {/* Removed Anleitung Section */}
        </div>
      </div>

      <div
        className="flex-1 flex flex-col overflow-y-auto"
        style={{ width: "100%" }}
      >
        <div className="p-10 flex flex-col flex-grow">
          {selectedProject && (
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
                <Box sx={{ display: "flex", flexDirection: "column" }}>
                  <Typography
                    variant="h5"
                    component="h1"
                    fontWeight="bold"
                    sx={{ color: "black" }}
                  >
                    {selectedProject}
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      mt: 1,
                    }}
                  >
                    {ifcLoading ? (
                      <Typography variant="body2" color="text.secondary">
                        Elemente werden geladen...
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        {ifcElements.length} Elemente
                      </Typography>
                    )}

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

                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={() =>
                      selectedProject && fetchProjectElements(selectedProject)
                    }
                    disabled={
                      ifcLoading || !backendConnected || !selectedProject
                    }
                    className="text-primary border-primary whitespace-nowrap"
                    size="small"
                  >
                    {ifcLoading ? "Lädt..." : "Projekt neu laden"}
                  </Button>

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
                      {kafkaSending ? "Senden..." : "Vorschau & Senden"}
                    </Button>
                  )}
                </Box>
              </Box>
            </Box>
          )}

          {!selectedProject && backendConnected && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Bitte wählen Sie ein Projekt aus der Liste aus.
            </Alert>
          )}
          {selectedProject &&
            !ifcLoading &&
            ifcElements.length === 0 &&
            !ifcError && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Keine Elemente für dieses Projekt gefunden oder Daten werden
                noch verarbeitet.
              </Alert>
            )}
          {ifcError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {ifcError}
            </Alert>
          )}

          <div className="border border-gray-200 rounded-md flex-grow flex flex-col">
            <IfcElementsList
              elements={ifcElements}
              loading={ifcLoading}
              error={ifcError}
              editedElements={editedElements}
              editedElementsCount={editedElementsCount}
              handleQuantityChange={handleQuantityChange}
              resetEdits={resetEdits}
              onEbkpStatusChange={setHasEbkpGroups}
              targetIfcClasses={TARGET_IFC_CLASSES}
              viewType={viewType}
              setViewType={setViewType}
            />
          </div>
        </div>
      </div>

      {selectedProject && (
        <QtoPreviewDialog
          open={previewDialogOpen}
          onClose={handleClosePreviewDialog}
          onSend={sendQtoToDatabase}
          selectedProject={selectedProject}
          selectedFileName={undefined}
          ifcElements={ifcElements}
          editedElements={editedElements}
          isSending={kafkaSending}
        />
      )}
    </div>
  );
};

export default MainPage;
