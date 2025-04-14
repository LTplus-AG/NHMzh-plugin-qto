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
  Chip,
} from "@mui/material";
import { useEffect, useState, useMemo } from "react";
import apiClient, {
  IFCElement as ApiIFCElement,
  ProjectMetadata,
} from "../api/ApiClient";
import { IFCElement as LocalIFCElement } from "../types/types";
import { useElementEditing } from "./IfcElements/hooks/useElementEditing";
import IfcElementsList from "./IfcElementsList";
import { QtoPreviewDialog } from "./QtoPreviewDialog";
import React from "react";
import { quantityConfig } from "../types/types";
import ManualElementForm from "./IfcElements/ManualElementForm";
import { ManualElementInput } from "../types/manualTypes";
import { v4 as uuidv4 } from "uuid";
import { useEbkpGroups } from "./IfcElements/hooks/useEbkpGroups";
import { BatchElementData } from "../types/batchUpdateTypes";

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
  const [projectMetadata, setProjectMetadata] =
    useState<ProjectMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState<boolean>(false);
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualFormLoading] = useState<boolean>(false);
  const [classificationFilter, setClassificationFilter] = useState<string[]>(
    []
  );
  const [editingElement, setEditingElement] = useState<LocalIFCElement | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [elementToDelete, setElementToDelete] =
    useState<LocalIFCElement | null>(null);

  const {
    editedElements,
    editedElementsCount,
    handleQuantityChange,
    resetEdits,
  } = useElementEditing();

  const { ebkpGroups, uniqueClassifications } = useEbkpGroups(
    ifcElements,
    classificationFilter,
    viewType
  );

  // <<< ADDED: Calculate unique levels >>>
  const uniqueLevels = useMemo(() => {
    const levels = new Set<string>();
    ifcElements.forEach((el) => {
      if (el.level) {
        // Check if level exists and is not null/empty
        levels.add(el.level);
      }
    });
    return Array.from(levels).sort(); // Return sorted array
  }, [ifcElements]);

  // <<< ADDED: Calculate unique material names >>>
  const uniqueMaterialNames = useMemo(() => {
    const materialNames = new Set<string>();
    ifcElements.forEach((el) => {
      if (el.materials && Array.isArray(el.materials)) {
        el.materials.forEach((mat) => {
          if (mat.name) {
            // Check if name exists and is not null/empty
            materialNames.add(mat.name);
          }
        });
      }
    });
    return Array.from(materialNames).sort(); // Return sorted array
  }, [ifcElements]);

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
        const fetchedProjects = projects || [];
        setProjectList(fetchedProjects);
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
    if (
      projectList.length > 0 &&
      (!selectedProject || !projectList.includes(selectedProject))
    ) {
      const defaultProject = projectList[0];
      setSelectedProject(defaultProject);
    } else if (projectList.length === 0 && selectedProject !== "") {
      setSelectedProject("");
    }
  }, [projectList]);

  useEffect(() => {
    if (selectedProject && backendConnected) {
      fetchProjectElements(selectedProject);
      fetchProjectMetadata(selectedProject);
      resetEdits();
    } else {
      setIfcElements([]);
      setIfcError(null);
      setProjectMetadata(null);
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
        setIfcLoading(false);
        return; // <<< Return early if no elements fetched
      }

      const mappedElements: LocalIFCElement[] = elementsFromApi.map(
        (apiElement: ApiIFCElement, _index: number): LocalIFCElement => {
          return {
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
            quantity:
              apiElement.quantity &&
              typeof apiElement.quantity.type === "string"
                ? {
                    type: apiElement.quantity.type,
                    value: apiElement.quantity.value ?? null,
                    unit: apiElement.quantity.unit,
                  }
                : null,
            original_quantity: (apiElement as any).original_quantity ?? null,
            area: apiElement.area,
            length: apiElement.length,
            // Check if volume is an object and has 'net' property before accessing it
            volume:
              typeof apiElement.volume === "object" &&
              apiElement.volume !== null &&
              "net" in apiElement.volume
                ? (apiElement.volume as { net: number }).net
                : typeof apiElement.volume === "number"
                ? apiElement.volume
                : null,
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
            status: apiElement.status,
            is_manual: apiElement.is_manual,
          };
        }
      );

      setIfcElements(mappedElements);
      if (mappedElements.length === 0) {
      }
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("Not Found")) {
      } else {
        setIfcError(
          `Could not load elements for project ${projectName}. Please check backend connection and logs.`
        );
        setIfcElements([]);
      }
    } finally {
      setIfcLoading(false);
    }
  };

  const fetchProjectMetadata = async (projectName: string) => {
    setMetadataLoading(true);
    try {
      const metadata = await apiClient.getProjectMetadata(projectName);
      setProjectMetadata(metadata);
    } catch (error) {
      console.error(
        `Error fetching metadata for project ${projectName}:`,
        error
      );
      setProjectMetadata(null);
    } finally {
      setMetadataLoading(false);
    }
  };

  const sendQtoToDatabase = async () => {
    setIsPreviewDialogSending(true);
    setKafkaSuccess(null);
    setKafkaError(null);

    if (!selectedProject) {
      setKafkaError("Kein Projekt ausgewählt.");
      setIsPreviewDialogSending(false);
      return;
    }

    try {
      // --- REVERTED: Prepare data for batch update endpoint ---
      const batchData: BatchElementData[] = [];

      // Process ALL current elements (IFC-derived and locally added manual ones)
      for (const element of ifcElements) {
        const isEdited = editedElements.hasOwnProperty(element.id);

        // Determine current quantity to send
        let currentQuantity: any = null;
        const config = quantityConfig[element.type] || {
          key: "area",
          unit: "m²",
        }; // Default config

        if (isEdited) {
          const editData = editedElements[element.id];
          if (editData.newQuantity) {
            currentQuantity = {
              value: editData.newQuantity.value,
              type: editData.newQuantity.type,
              unit: config.unit ?? "?", // Ensure unit is string
            };
          } else {
            // Fallback for older structure
            currentQuantity = {
              value:
                config.key === "area" ? editData.newArea : editData.newLength,
              type: config.key,
              unit: config.unit ?? "?", // Ensure unit is string
            };
          }
          // Ensure value is a number
          if (currentQuantity && typeof currentQuantity.value === "string") {
            const parsedValue = parseFloat(currentQuantity.value);
            currentQuantity.value = !isNaN(parsedValue) ? parsedValue : null;
          } else if (
            currentQuantity &&
            typeof currentQuantity.value !== "number"
          ) {
            currentQuantity.value = null; // Default invalid non-strings to null
          }
        } else {
          // Use the element's current quantity if not edited
          currentQuantity = element.quantity;
        }

        // Determine original quantity (important for batch update)
        // Use the original_quantity from the element itself,
        // or reconstruct if it was potentially edited (fallback, less ideal)
        let originalQuantityForPayload = element.original_quantity;
        if (!originalQuantityForPayload && isEdited) {
          const editData = editedElements[element.id];
          if (editData.originalQuantity) {
            originalQuantityForPayload = {
              value: editData.originalQuantity.value,
              type: editData.originalQuantity.type,
              unit: config.unit ?? "?", // Ensure unit is string
            };
          } else {
            // Fallback if originalQuantity not in editData
            originalQuantityForPayload = {
              value:
                (config.key === "area"
                  ? editData.originalArea
                  : editData.originalLength) ?? null, // Handle potential undefined
              type: config.key,
              unit: config.unit ?? "?", // Ensure unit is string
            };
          }
        } else if (!originalQuantityForPayload && !isEdited) {
          // If original is missing even on non-edited, try to use current quantity
          originalQuantityForPayload = element.quantity;
        }

        // Skip element if current quantity is fundamentally invalid/missing
        if (
          !currentQuantity ||
          currentQuantity.value === null ||
          currentQuantity.value === undefined
        ) {
          console.warn(
            `Skipping element ${element.id} in batch due to invalid/missing current quantity:`,
            currentQuantity
          );
          continue;
        }

        // Construct the full element data for the batch
        batchData.push({
          id: element.id, // Will be manual_... for new elements
          global_id: element.global_id,
          type: element.type,
          name: element.name,
          type_name: element.type_name,
          description: element.description,
          properties: element.properties,
          materials: element.materials?.map((m) => ({
            // Ensure materials format is correct
            name: m.name,
            fraction: m.fraction ?? 0,
            unit: m.unit,
            volume: m.volume,
          })),
          level: element.level,
          quantity: {
            // Ensure structure is correct
            value: currentQuantity.value,
            type: currentQuantity.type,
            unit: currentQuantity.unit,
          },
          original_quantity: originalQuantityForPayload
            ? {
                // Ensure structure is correct
                value: originalQuantityForPayload.value ?? null, // Ensure null if value missing
                type: originalQuantityForPayload.type,
                unit: originalQuantityForPayload.unit ?? "?", // Ensure unit is string
              }
            : null,
          classification: element.classification
            ? {
                // Ensure structure is correct
                id: element.classification.id ?? null,
                name: element.classification.name ?? null,
                system: element.classification.system ?? null,
              }
            : null,
          is_manual: element.is_manual,
          is_structural: element.is_structural,
          is_external: element.is_external,
          // Status will be set to 'active' by the backend batch endpoint
        });
      }
      // --- End Modification ---

      // 2. Call the BATCH UPDATE API endpoint
      console.log(
        `Sending ${batchData.length} elements to /batch-update endpoint...`
      );
      const response = await apiClient.batchUpdateElements(
        selectedProject,
        batchData
      );

      // 3. Handle response and update UI
      if (response && response.success === true) {
        setKafkaSuccess(true);
        setPreviewDialogOpen(false);
        resetEdits(); // Clear local edits
        // Fetching elements again will get the now 'active' elements, including newly created manual ones
        fetchProjectElements(selectedProject);
      } else {
        setKafkaError(
          `Fehler bei der Stapelverarbeitung: ${
            response?.message || "Unknown error"
          }`
        );
        setIsPreviewDialogSending(false);
      }
    } catch (error) {
      console.error("Error during batch element update:", error);
      setKafkaError(
        `Failed to save/update elements: ${
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

  const handleEditManualClick = (element: LocalIFCElement) => {
    setEditingElement(element);
    setShowManualForm(true);
  };

  const handleManualSubmit = async (
    data: ManualElementInput,
    editingId: string | null
  ) => {
    if (!selectedProject) return;

    let processedMaterials: LocalIFCElement["materials"] = [];
    if (
      data.materials.length > 0 &&
      typeof data.totalVolume === "number" &&
      data.totalVolume > 0
    ) {
      processedMaterials = data.materials.map((m) => ({
        name: m.name,
        fraction: m.fraction,
        volume: data.totalVolume! * m.fraction,
        unit: "m³",
      }));
    } else {
      processedMaterials = data.materials.map((m) => ({
        name: m.name,
        fraction: m.fraction,
        volume: undefined,
        unit: undefined,
      }));
    }

    if (editingId) {
      setIfcElements((prev) =>
        prev.map((el) =>
          el.id === editingId
            ? {
                ...el,
                name: data.name,
                type: data.type,
                level: data.level,
                quantity: data.quantity,
                classification: data.classification,
                materials: processedMaterials,
                description: data.description,
                area:
                  data.quantity.type === "area" ? data.quantity.value : null,
                length:
                  data.quantity.type === "length" ? data.quantity.value : null,
                volume:
                  data.quantity.type === "volume" ? data.quantity.value : null,
              }
            : el
        )
      );
    } else {
      // We are adding a new element
      const tempId = `manual_${uuidv4()}`;
      const newManualElement: LocalIFCElement = {
        id: tempId,
        global_id: `MANUAL-${tempId}`,
        type: data.type,
        name: data.name,
        type_name: data.name,
        description: data.description,
        level: data.level,
        quantity: data.quantity,
        original_quantity: data.quantity,
        classification: data.classification,
        materials: processedMaterials,
        properties: {},
        is_manual: true,
        status: "pending",
        area: data.quantity.type === "area" ? data.quantity.value : null,
        length: data.quantity.type === "length" ? data.quantity.value : null,
        volume: null,
        original_area:
          data.quantity.type === "area" ? data.quantity.value : null,
        original_length:
          data.quantity.type === "length" ? data.quantity.value : null,
        original_volume: null,
        is_structural: false,
        is_external: false,
      };
      setIfcElements((prev) => [...prev, newManualElement]);
    }

    setShowManualForm(false);
    setEditingElement(null); // Clear editing state
  };

  const handleManualCancel = () => {
    setShowManualForm(false);
    setEditingElement(null); // <<< Clear editing state on cancel
  };

  const handleClassificationFilterChange = (newFilter: string[]) => {
    setClassificationFilter(newFilter);
  };

  const openDeleteConfirm = (element: LocalIFCElement) => {
    setElementToDelete(element);
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setElementToDelete(null);
    setDeleteConfirmOpen(false);
  };

  const handleDeleteConfirm = async () => {
    if (!elementToDelete || !selectedProject) return;

    const idToDelete = elementToDelete.id;
    const isLocalUnsaved = idToDelete.startsWith("manual_");

    setKafkaSuccess(null);
    setKafkaError(null);

    if (isLocalUnsaved) {
      setIfcElements((prev) => prev.filter((el) => el.id !== idToDelete));
      closeDeleteConfirm();
    } else {
      // Element exists in DB, proceed with API call
      try {
        await apiClient.deleteElement(selectedProject, idToDelete);
        setIfcElements((prev) => prev.filter((el) => el.id !== idToDelete));
        setKafkaSuccess(true);
      } catch (error) {
        console.error(`Error deleting element ${idToDelete}:`, error);
        setKafkaError(
          `Fehler beim Löschen: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      } finally {
        closeDeleteConfirm();
      }
    }
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

      <Dialog open={deleteConfirmOpen} onClose={closeDeleteConfirm}>
        <DialogTitle>Element Löschen Bestätigen</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Sind Sie sicher, dass Sie das manuelle Element \"
            <strong>{elementToDelete?.name || elementToDelete?.id}</strong>\ \"
            unwiderruflich löschen möchten?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteConfirm}>Abbrechen</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            Löschen
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
                justifyContent: "space-between",
                alignItems: "center",
                mb: 3,
                gap: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {metadataLoading ? (
                  <Typography variant="body2" color="text.secondary">
                    Lade Metadaten...
                  </Typography>
                ) : projectMetadata?.filename ? (
                  <Tooltip
                    title={`Datei: ${projectMetadata.filename} | Elemente: ${
                      projectMetadata.element_count ?? "N/A"
                    } | Letzte Verarbeitung: ${
                      projectMetadata.updated_at
                        ? new Date(projectMetadata.updated_at).toLocaleString(
                            "de-DE",
                            {
                              timeZone: "Europe/Berlin",
                              dateStyle: "short",
                              timeStyle: "medium",
                            }
                          )
                        : "N/A"
                    }`}
                  >
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        fontStyle: "italic",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {projectMetadata.filename} (
                      {projectMetadata.element_count ?? "-"} Elemente) - Stand:{" "}
                      {(() => {
                        if (!projectMetadata?.updated_at) return "N/A";
                        const dateStr = projectMetadata.updated_at;
                        const utcDateStr = dateStr.endsWith("Z")
                          ? dateStr
                          : dateStr + "Z";
                        try {
                          return new Date(utcDateStr).toLocaleTimeString(
                            "de-DE",
                            {
                              timeZone: "Europe/Berlin",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          );
                        } catch (e) {
                          console.error("[Debug] Error formatting date:", e);
                          return "Invalid Date";
                        }
                      })()}
                    </Typography>
                  </Tooltip>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {/* Fallback: Show only element count if metadata fails */}
                    {ifcElements.length}{" "}
                    {ifcElements.length === 1 ? "Element" : "Elemente"}
                  </Typography>
                )}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  flexShrink: 0,
                }}
              >
                {editedElementsCount > 0 && (
                  <Tooltip title="Änderungen zurücksetzen">
                    <Chip
                      label={`${editedElementsCount} Element${
                        editedElementsCount > 1 ? "e" : ""
                      } bearbeitet`}
                      color="warning"
                      onDelete={resetEdits}
                      size="small"
                    />
                  </Tooltip>
                )}

                {editedElementsCount === 0 &&
                  TARGET_IFC_CLASSES &&
                  TARGET_IFC_CLASSES.length > 0 && (
                    <Tooltip
                      title={
                        <React.Fragment>
                          <p>Nur folgende IFC-Klassen werden berücksichtigt:</p>
                          <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                            {TARGET_IFC_CLASSES.map((cls: string) => (
                              <li key={cls}>{cls}</li>
                            ))}
                          </ul>
                        </React.Fragment>
                      }
                      arrow
                    >
                      <IconButton size="small" sx={{ p: 0 }}>
                        <InfoIcon fontSize="small" color="action" />
                      </IconButton>
                    </Tooltip>
                  )}

                <Button
                  variant="outlined"
                  color="primary"
                  onClick={() => {
                    if (selectedProject) {
                      fetchProjectElements(selectedProject);
                      fetchProjectMetadata(selectedProject);
                    }
                  }}
                  disabled={ifcLoading || !backendConnected || !selectedProject}
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
                    disabled={!backendConnected || !hasEbkpGroups || ifcLoading}
                    className="bg-primary whitespace-nowrap"
                    size="small"
                  >
                    {ifcLoading ? "Lädt..." : "Vorschau & Senden"}
                  </Button>
                )}
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
              handleQuantityChange={handleQuantityChange}
              onEbkpStatusChange={setHasEbkpGroups}
              targetIfcClasses={TARGET_IFC_CLASSES}
              viewType={viewType}
              setViewType={setViewType}
              onAddManualClick={() => setShowManualForm(true)}
              isAddManualDisabled={
                !backendConnected || !selectedProject || ifcLoading
              }
              ebkpGroups={ebkpGroups}
              uniqueClassifications={uniqueClassifications}
              classificationFilter={classificationFilter}
              setClassificationFilter={handleClassificationFilterChange}
              handleEditManualClick={handleEditManualClick}
              openDeleteConfirm={openDeleteConfirm}
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

      <Dialog
        open={showManualForm}
        onClose={handleManualCancel}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0 }}>
          <ManualElementForm
            onSubmit={handleManualSubmit}
            onCancel={handleManualCancel}
            isLoading={manualFormLoading}
            availableLevels={uniqueLevels}
            availableMaterialNames={uniqueMaterialNames}
            initialData={editingElement}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MainPage;
