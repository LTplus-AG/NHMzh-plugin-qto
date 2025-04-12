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
  const [kafkaSuccess, setKafkaSuccess] = useState<boolean | null>(null);
  const [kafkaError, setKafkaError] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState<boolean>(false);
  const [isPreviewDialogSending, setIsPreviewDialogSending] =
    useState<boolean>(false);
  const [hasEbkpGroups, setHasEbkpGroups] = useState<boolean>(true);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [viewType, setViewType] = useState<string>("individual");
  const [projectList, setProjectList] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

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
      }
    }
  };

  useEffect(() => {
    const fetchProjects = async () => {
      if (!backendConnected) return;
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        const projects = await apiClient.listProjects();
        console.log("[MainPage] Fetched projects from API:", projects);
        setProjectList(projects || []);
        console.log("[MainPage] Updated projectList state:", projects || []);
        if (projects && projects.length > 0 && !selectedProject) {
          setSelectedProject(projects[0]);
          console.log("[MainPage] Set selectedProject to:", projects[0]);
        } else if (projects?.length === 0) {
          setSelectedProject("");
        }
      } catch (error) {
        console.error("Error fetching project list:", error);
        setProjectsError("Could not load project list.");
        setProjectList([]);
        setSelectedProject("");
      } finally {
        setProjectsLoading(false);
      }
    };

    fetchProjects();
  }, [backendConnected]);

  useEffect(() => {
    if (selectedProject && backendConnected) {
      fetchProjectElements(selectedProject);
      resetEdits();
    } else {
      setIfcElements([]);
      setIfcError(null);
      resetEdits();
    }
  }, [selectedProject, backendConnected]);

  const fetchProjectElements = async (projectName: string) => {
    setIfcLoading(true);
    setIfcError(null);
    try {
      const elementsFromApi: ApiIFCElement[] =
        await apiClient.getProjectElements(projectName);

      if (elementsFromApi.length === 0) {
        console.log(
          `No elements found for project '${projectName}'. Using previously loaded data if available.`
        );
        setIfcLoading(false);
        return;
      }

      const mappedElements: LocalIFCElement[] = elementsFromApi.map(
        (apiElement: ApiIFCElement): LocalIFCElement => ({
          id: apiElement.id,
          global_id: apiElement.global_id,
          type: apiElement.type,
          name: apiElement.name,
          type_name: (apiElement as any).type_name,
          description: apiElement.description,
          properties: apiElement.properties ?? {},
          material_volumes: apiElement.material_volumes,
          level: apiElement.level,
          classification_id: apiElement.classification_id,
          classification_name: apiElement.classification_name,
          classification_system: apiElement.classification_system,
          area: apiElement.area,
          length: apiElement.length,
          volume:
            typeof apiElement.volume === "object" && apiElement.volume !== null
              ? apiElement.volume.net
              : apiElement.volume,
          original_area: (apiElement as any).original_area,
          original_length: (apiElement as any).original_length,
          original_volume: (apiElement as any).original_volume,
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
      if (mappedElements.length === 0) {
        console.log(`No elements found for project '${projectName}'.`);
      }
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
        setIfcElements([]);
      }
    } finally {
      setIfcLoading(false);
    }
  };

  const sendQtoToDatabase = async () => {
    setIsPreviewDialogSending(true);
    setKafkaSuccess(null);
    setKafkaError(null);

    try {
      if (!selectedProject) {
        throw new Error("No project selected");
      }

      // Call the approve endpoint
      await apiClient.approveProjectElements(selectedProject);

      // Set success and close dialog
      setKafkaSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief delay
      setPreviewDialogOpen(false);
    } catch (error) {
      console.error("Error approving elements:", error);
      setKafkaError(
        `Failed to approve elements: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsPreviewDialogSending(false);
    }
  };

  const handleCloseConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleOpenPreviewDialog = () => {
    // Open the preview dialog
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
            <FormControl
              variant="outlined"
              focused
              fullWidth
              disabled={projectsLoading || !backendConnected}
            >
              <Select
                id="select-project"
                size="small"
                value={selectedProject}
                onChange={(e) => {
                  const newProject = e.target.value as string;
                  if (newProject !== selectedProject) {
                    setSelectedProject(newProject);
                    setIfcElements([]);
                    setIfcLoading(true);
                    setIfcError(null);
                  }
                }}
                labelId="select-project"
                displayEmpty
              >
                {projectsLoading && (
                  <MenuItem value="" disabled>
                    Lade Projekte...
                  </MenuItem>
                )}
                {projectsError && (
                  <MenuItem value="" disabled>
                    Fehler beim Laden der Projekte
                  </MenuItem>
                )}
                {!projectsLoading &&
                  !projectsError &&
                  projectList.length === 0 && (
                    <MenuItem value="" disabled>
                      Keine Projekte gefunden
                    </MenuItem>
                  )}
                {projectList.map((projectName) => (
                  <MenuItem key={projectName} value={projectName}>
                    {projectName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {projectsError && (
              <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                {projectsError}
              </Typography>
            )}
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
                        {ifcElements.length}{" "}
                        {ifcElements.length === 1 ? "Element" : "Elemente"}
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
                        !backendConnected || !hasEbkpGroups || ifcLoading
                      }
                      className="bg-primary whitespace-nowrap"
                      size="small"
                    >
                      {ifcLoading ? "Lädt..." : "Vorschau & Senden"}
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
                Keine Elemente für dieses Projekt gefunden oder die Daten werden
                noch verarbeitet. Versuchen Sie, das Projekt neu zu laden.
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
          selectedFileName={
            selectedProject ? `${selectedProject}.ifc` : "unknown.ifc"
          }
          ifcElements={ifcElements}
          editedElements={editedElements}
          isSending={isPreviewDialogSending}
        />
      )}
    </div>
  );
};

export default MainPage;
