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

  console.log(
    "[MainPage Render] uniqueClassifications:",
    uniqueClassifications
  );

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
        const fetchedProjects = projects || [];
        setProjectList(fetchedProjects);
        console.log("[MainPage] Updated projectList state:", fetchedProjects);
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
      console.log(
        "[MainPage Effect] Setting default selectedProject to:",
        defaultProject
      );
    } else if (projectList.length === 0 && selectedProject !== "") {
      setSelectedProject("");
      console.log(
        "[MainPage Effect] Resetting selectedProject as projectList is empty."
      );
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

      // <<< ADDED: Log raw API data >>>
      console.log(
        "[fetchProjectElements] Received data from API:",
        elementsFromApi.slice(0, 5) // Log first 5 elements for inspection
      );

      if (elementsFromApi.length === 0) {
        console.log(
          `No elements found for project '${projectName}'. Using previously loaded data if available.`
        );
        setIfcLoading(false);
        return; // <<< Return early if no elements fetched
      }

      const mappedElements: LocalIFCElement[] = elementsFromApi.map(
        (apiElement: ApiIFCElement, index: number): LocalIFCElement => {
          // <<< ADDED: Log mapping details for first few elements >>>
          if (index < 3) {
            console.log(
              `[fetchProjectElements] Mapping API element ${index} (ID: ${apiElement.id}):`,
              apiElement
            );
            console.log(
              `  - API original_quantity:`,
              (apiElement as any).original_quantity
            );
            console.log(`  - API quantity:`, apiElement.quantity);
          }

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
            // Map quantity only if it exists and has a valid type
            quantity:
              apiElement.quantity &&
              typeof apiElement.quantity.type === "string"
                ? {
                    type: apiElement.quantity.type, // Type is guaranteed string here
                    value: apiElement.quantity.value ?? null, // Default undefined value to null
                    unit: apiElement.quantity.unit,
                  }
                : null, // Set to null if quantity or type is missing/invalid
            original_quantity: (apiElement as any).original_quantity ?? null, // Default to null if missing
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
                : null, // Default to null if it's not an object with 'net' or a number
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
            // Add other fields as needed
          };
        }
      );

      // <<< ADDED: Log mapped data >>>
      console.log(
        "[fetchProjectElements] Mapped elements:",
        mappedElements.slice(0, 5) // Log first 5 mapped elements
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
      // 1. Prepare data for batch update
      const batchData: BatchElementData[] = [];

      // Process all current elements (IFC-derived and locally added manual ones)
      for (const element of ifcElements) {
        const isEdited = editedElements.hasOwnProperty(element.id);

        // Determine current and original quantities to send
        let currentQuantity: any = null;
        let originalQuantityForPayload: any = null;

        if (isEdited) {
          const editData = editedElements[element.id];
          const config = quantityConfig[element.type] || {
            key: "area",
            unit: "m²",
          }; // Get config once

          // Determine current quantity with unit
          if (editData.newQuantity) {
            // Check if newQuantity exists in editData
            currentQuantity = {
              value: editData.newQuantity.value, // Get value
              type: editData.newQuantity.type, // Get type
              unit: config.unit, // Add unit from config
            };
          } else {
            // Fallback for older edit structure (newArea/newLength)
            currentQuantity = {
              value:
                config.key === "area" ? editData.newArea : editData.newLength,
              type: config.key,
              unit: config.unit,
            };
          }

          // Determine original quantity with unit
          if (editData.originalQuantity) {
            // Check if originalQuantity exists in editData
            originalQuantityForPayload = {
              value: editData.originalQuantity.value,
              type: editData.originalQuantity.type,
              unit: config.unit,
            };
          } else {
            // Fallback for older edit structure (originalArea/originalLength)
            originalQuantityForPayload = {
              value:
                config.key === "area"
                  ? editData.originalArea
                  : editData.originalLength,
              type: config.key,
              unit: config.unit,
            };
          }

          // Ensure current quantity value is a valid number
          if (currentQuantity && typeof currentQuantity.value === "string") {
            const parsedValue = parseFloat(currentQuantity.value);
            if (isNaN(parsedValue) || parsedValue <= 0) {
              // Handle invalid number (maybe set to null or default, or keep as is depending on backend expectation)
              console.warn(
                `Invalid edited quantity value for ${element.id}: ${currentQuantity.value}`
              );
              // Optionally, you could set currentQuantity.value = null here if the backend expects it
            } else {
              currentQuantity.value = parsedValue;
            }
          } else if (
            currentQuantity &&
            (currentQuantity.value === null || currentQuantity.value <= 0)
          ) {
            console.warn(
              `Null or non-positive edited quantity value for ${element.id}`
            );
          }
        } else {
          // For elements NOT locally edited (existing non-edited or new manual)
          currentQuantity = element.quantity;
          originalQuantityForPayload = element.original_quantity;
          // Check validity of non-edited quantity
          if (
            !currentQuantity ||
            currentQuantity.value === null ||
            currentQuantity.value <= 0
          ) {
            console.warn(
              `Invalid or missing quantity for non-edited element ${element.id}, sending as is.`,
              currentQuantity
            );
          }
        }

        // Skip element entirely ONLY if quantity object itself is missing after processing
        // (Shouldn't happen with current logic but safe check)
        if (!currentQuantity) {
          console.warn(
            `Skipping element ${element.id} due to missing quantity object.`
          );
          continue;
        }

        // Push ALL elements to the batch
        batchData.push({
          id: element.id,
          global_id: element.global_id,
          type: element.type,
          name: element.name,
          type_name: element.type_name,
          description: element.description,
          properties: element.properties,
          materials: element.materials?.map((m) => ({
            name: m.name,
            fraction: m.fraction ?? 0,
            unit: m.unit,
            volume: m.volume,
          })),
          level: element.level,
          quantity: currentQuantity, // Send determined quantity
          original_quantity: originalQuantityForPayload, // Send determined original quantity
          classification: element.classification
            ? {
                id: element.classification.id ?? null, // Default undefined to null
                name: element.classification.name ?? null,
                system: element.classification.system ?? null,
              }
            : null,
          is_manual: element.is_manual,
          is_structural: element.is_structural,
          is_external: element.is_external,
        });
      }

      if (batchData.length === 0) {
        console.log("ifcElements array was empty, nothing to send.");
        setKafkaError("Keine Elemente zum Speichern vorhanden.");
        setPreviewDialogOpen(false);
        setIsPreviewDialogSending(false);
        resetEdits();
        return;
      }

      // 2. Call the new batch update API endpoint
      const response = await apiClient.batchUpdateElements(
        selectedProject,
        batchData
      );

      // 3. Handle response and update UI
      if (response) {
        setKafkaSuccess(true);
        setPreviewDialogOpen(false);
        resetEdits();
        fetchProjectElements(selectedProject);
        console.log(
          "Batch update successful, re-fetching elements...",
          response
        );
      } else {
        // Handle cases where API call might have failed structurally (should be caught by catch block though)
        setKafkaError("Fehler bei der Stapelverarbeitung.");
        setIsPreviewDialogSending(false);
      }
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

  const handleEditManualClick = (element: LocalIFCElement) => {
    console.log("Editing manual element:", element);
    // Set the element to be edited (ensure structure matches form needs if necessary)
    // The form initializer now handles mapping LocalIFCElement to ManualElementInput
    setEditingElement(element);
    setShowManualForm(true); // Open the form dialog
  };

  const handleManualSubmit = async (
    data: ManualElementInput,
    editingId: string | null
  ) => {
    if (!selectedProject) return;

    if (editingId) {
      // We are editing an existing element
      console.log(`Updating element with ID: ${editingId}`, data);
      setIfcElements((prev) =>
        prev.map((el) =>
          el.id === editingId
            ? {
                // Update the existing element, keeping its ID
                ...el, // Keep existing non-form fields like global_id, status etc.
                name: data.name,
                type: data.type,
                level: data.level,
                quantity: data.quantity,
                classification: data.classification,
                materials: data.materials.map((formMat) => {
                  // Find the original material in the element being edited ('el')
                  const originalMat = el.materials?.find(
                    (origM) => origM.name === formMat.name
                  );
                  return {
                    name: formMat.name,
                    fraction: formMat.fraction,
                    // Use original volume and unit if found, otherwise keep as undefined/null
                    volume: originalMat?.volume,
                    unit: originalMat?.unit,
                  };
                }),
                description: data.description,
                // Recalculate area/length based on updated quantity
                area:
                  data.quantity.type === "area" ? data.quantity.value : null,
                length:
                  data.quantity.type === "length" ? data.quantity.value : null,
                volume:
                  data.quantity.type === "volume" ? data.quantity.value : null,
                // Keep original_* fields as they were unless specifically editing them is allowed
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
        original_quantity: data.quantity, // Original is same as initial for new manual
        classification: data.classification,
        materials: data.materials.map((m) => ({
          name: m.name,
          fraction: m.fraction,
          unit: data.quantity.unit,
        })),
        properties: {},
        is_manual: true,
        status: "active",
        area: data.quantity.type === "area" ? data.quantity.value : null,
        length: data.quantity.type === "length" ? data.quantity.value : null,
        volume: data.quantity.type === "volume" ? data.quantity.value : null,
        original_area:
          data.quantity.type === "area" ? data.quantity.value : null,
        original_length:
          data.quantity.type === "length" ? data.quantity.value : null,
        original_volume:
          data.quantity.type === "volume" ? data.quantity.value : null,
        is_structural: false,
        is_external: false,
      };
      setIfcElements((prev) => [...prev, newManualElement]);
      console.log("Locally added manual element:", newManualElement);
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

    console.log(
      `Attempting to delete element: ${idToDelete} (Local unsaved: ${isLocalUnsaved})`
    );
    setKafkaSuccess(null);
    setKafkaError(null);

    if (isLocalUnsaved) {
      // Just remove from local state, no API call needed
      setIfcElements((prev) => prev.filter((el) => el.id !== idToDelete));
      console.log(`Locally removed unsaved manual element: ${idToDelete}`);
      closeDeleteConfirm();
      // Optionally show a specific success message for local removal
    } else {
      // Element exists in DB, proceed with API call
      try {
        await apiClient.deleteElement(selectedProject, idToDelete);
        setIfcElements((prev) => prev.filter((el) => el.id !== idToDelete));
        setKafkaSuccess(true); // Show DB delete success message
        console.log(`Successfully deleted element via API: ${idToDelete}`);
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
