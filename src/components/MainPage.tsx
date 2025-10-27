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
import { useEffect, useState, useMemo, useRef } from "react";
import apiClient, {
  IFCElement as ApiIFCElement,
  ProjectMetadata,
} from "../api/ApiClient";
import { IFCElement as LocalIFCElement } from "../types/types";
import { useElementEditing } from "./IfcElements/hooks/useElementEditing";
import IfcElementsList from "./IfcElementsList";
import { QtoPreviewDialog } from "./QtoPreviewDialog";
import { getVolumeValue } from "../utils/volumeHelpers";
import React from "react";
import ManualElementForm from "./IfcElements/ManualElementForm";
import { ManualElementInput, ManualQuantityInput } from "../types/manualTypes";
import { v4 as uuidv4 } from "uuid";
import { useEbkpGroups } from "./IfcElements/hooks/useEbkpGroups";
import { BatchElementData } from "../types/batchUpdateTypes";
import { ElementQuantityUpdate, isQuantityType } from "../api/types";
import { useExcelDialog } from "../hooks/useExcelDialog";
import { ExcelService, ExcelImportData } from "../utils/excelService";
import { getEbkpNameFromCode } from "../data/ebkpData";
import SmartExcelButton from "./SmartExcelButton";
import ExcelImportDialog from "./ExcelImportDialog";
import EmptyState from "./ui/EmptyState";
import { Upload as UploadIcon } from "@mui/icons-material";
import { navigateToIfcUploader, getCurrentPlugin } from "../utils/navigation";
import logger from '../utils/logger';

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
  const [viewType, setViewType] = useState<string>("grouped");
  const [projectList, setProjectList] = useState<string[]>([]);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectMetadata, setProjectMetadata] =
    useState<ProjectMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState<boolean>(false);
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualFormLoading, setManualFormLoading] = useState<boolean>(false);
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

  // Track original elements for comparison during Excel import
  const [originalElements, setOriginalElements] = useState<Map<string, LocalIFCElement>>(new Map());

  // Track previous project to only reset edits when switching projects
  const prevProjectRef = useRef<string | null>(null);

  // Excel dialog state
  const {
    isOpen: excelDialogOpen,
    openDialog: openExcelDialog,
    closeDialog: closeExcelDialog,
    isImporting,
    isExporting,
    setIsExporting,
    lastImportTime,
    setLastImportTime,
    lastExportTime,
    setLastExportTime,
    importCount,
    setImportCount,
    exportCount,
    setExportCount,
  } = useExcelDialog();

  const { ebkpGroups, hierarchicalGroups, uniqueClassifications } = useEbkpGroups(
    ifcElements,
    classificationFilter,
    viewType
  );

  // <<< Calculate unique levels >>>
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

  // <<< Calculate unique material names >>>
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
        logger.warn(
          `Backend health check failed. Retrying in 4 seconds... (${retries} retries left)`
        );
        setTimeout(() => checkBackendConnectivity(retries - 1), 4000);
      } else {
        logger.error(
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
        logger.error("Error fetching project list:", error);
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
      
      // Only reset edits if we're switching to a DIFFERENT project
      // This prevents losing edits when the project refreshes or backend reconnects
      if (prevProjectRef.current !== selectedProject) {
        resetEdits();
        prevProjectRef.current = selectedProject;
      }
    } else {
      setIfcElements([]);
      setIfcError(null);
      setProjectMetadata(null);
      resetEdits();
      setOriginalElements(new Map());
      prevProjectRef.current = null;
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
            global_id: apiElement.global_id || '',
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
              typeof apiElement.quantity.type === "string" &&
              isQuantityType(apiElement.quantity.type)
                ? {
                    type: apiElement.quantity.type,
                    value: apiElement.quantity.value ?? null,
                    unit: apiElement.quantity.unit,
                  }
                : null,
            original_quantity: (apiElement as any).original_quantity ?? null,
            area: apiElement.area,
            length: apiElement.length,
            // Extract volume value using helper to handle both number and object types
            volume: getVolumeValue(apiElement.volume),
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
      
      // Store original elements for comparison during Excel import
      const originalMap = new Map<string, LocalIFCElement>();
      mappedElements.forEach(el => {
        originalMap.set(el.global_id, el);
      });
      setOriginalElements(originalMap);
      
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
      logger.error(
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

      // 1. Prepare quantity updates for ALL EDITED elements
      const quantityUpdates: ElementQuantityUpdate[] = [];
      for (const elementId in editedElements) {
        // Find the original element
        const originalElement = ifcElements.find((el) => el.global_id === elementId);

        // Include updates for all elements (both manual and non-manual)
        if (originalElement) {
          const editData = editedElements[elementId];
          if (editData.newQuantity) {
            // <<< ADDED Type assertion for newQuantity >>>
            const currentQuantity = editData.newQuantity as {
              value?: number | null;
              type?: string;
              unit?: string;
            };

            // Skip if type is missing or invalid to avoid wrong updates
            if (typeof currentQuantity.type === "string" && currentQuantity.type.trim()) {
              const normalizedType = currentQuantity.type.trim().toLowerCase();

              // Skip if type is not a valid quantity type
              if (!isQuantityType(normalizedType)) {
                logger.warn(`Skipping quantity update for element ${elementId}: unsupported quantity type '${currentQuantity.type}'`);
                continue;
              }

              // Only include finite numbers to prevent NaN from being sent
              const validValue = Number.isFinite(currentQuantity.value as number)
                ? (currentQuantity.value as number)
                : null;

              const normalizedUnit = typeof currentQuantity.unit === "string" && currentQuantity.unit.trim()
                ? currentQuantity.unit.trim()
                : normalizedType === "area"
                ? "m²"
                : normalizedType === "volume"
                ? "m³"
                : normalizedType === "length"
                ? "m"
                : "Stk";

              quantityUpdates.push({
                global_id: elementId,
                new_quantity: {
                  value: validValue,
                  type: normalizedType as "area" | "length" | "volume" | "count",
                  unit: normalizedUnit,
                },
              });
            } else {
              logger.warn(`Skipping quantity update for element ${elementId}: missing or invalid quantity type`);
            }
          }
          // Include fallback for older edit structure if necessary
          else if (
            editData.newArea !== undefined &&
            editData.newArea !== null
          ) {
            quantityUpdates.push({
              global_id: elementId,
              new_quantity: {
                value: editData.newArea,
                type: "area",
                unit: "m²",
              },
            });
          } else if (
            editData.newLength !== undefined &&
            editData.newLength !== null
          ) {
            quantityUpdates.push({
              global_id: elementId,
              new_quantity: {
                value: editData.newLength,
                type: "length",
                unit: "m",
              },
            });
          }
        }
      }
      // --- End data preparation modification ---

      // 2. Call the APPROVE API endpoint
      logger.info(
        `Sending ${quantityUpdates.length} quantity updates to /approve endpoint...`
      );
      // Ensure apiClient has an 'approveProject' method
      const response = await apiClient.approveProject(
        selectedProject,
        quantityUpdates
      );

      // 3. Handle response and update UI
      // The backend approve endpoint response structure might differ, adjust as needed
      if (response && response.status === "success") {
        // Check for success indicator
        setKafkaSuccess(true);
        setPreviewDialogOpen(false);
        resetEdits(); // Clear local edits
        // Fetching elements again will get the now 'active' elements
        fetchProjectElements(selectedProject);
      } else {
        setKafkaError(
          `Fehler bei der Projekt-Bestätigung: ${
            response?.message || "Unbekannter Fehler"
          }`
        );
      }
    } catch (error) {
      logger.error("Error during project approval:", error);
      setKafkaError(
        `Fehler: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsPreviewDialogSending(false); // Stop loading indicator
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
    editingId: string | null,
    originalStep2Quantity: ManualQuantityInput | null
  ) => {
    if (!selectedProject) return;
    setManualFormLoading(true);
    setKafkaSuccess(null);
    setKafkaError(null);

    // --- Prepare data for API ---
    let area: number | null = null;
    let length: number | null = null;
    let volume: number | null = null;
    let apiMaterials: {
      name: string;
      fraction: number;
      volume: number | null;
      unit: string;
    }[] = [];
    const apiQuantity = data.quantity; // Primary quantity from form (might be volume)

    // Set top-level area/length based on the *original* Step 2 quantity
    if (originalStep2Quantity) {
      if (
        originalStep2Quantity.type === "area" &&
        typeof originalStep2Quantity.value === "number"
      ) {
        area = originalStep2Quantity.value;
      } else if (
        originalStep2Quantity.type === "length" &&
        typeof originalStep2Quantity.value === "number"
      ) {
        length = originalStep2Quantity.value;
      }
    }

    // Determine volume and materials based on the *final* submitted data
    if (data.materials && data.materials.length > 0) {
      // Materials exist, the primary quantity (`apiQuantity`) is volume
      volume = typeof apiQuantity.value === "number" ? apiQuantity.value : null;
      if (volume !== null && volume > 0) {
        apiMaterials = data.materials.map((mat) => ({
          name: mat.name,
          fraction: mat.fraction,
          volume: volume !== null ? mat.fraction * volume : null,
          unit: "m³",
        }));
      } else {
        apiMaterials = data.materials.map((mat) => ({
          name: mat.name,
          fraction: mat.fraction,
          volume: null,
          unit: "m³",
        }));
      }
    } // No else needed here, volume remains null if no materials

    // --- Determine original area/length for NEW elements ---
    let original_area: number | null = null;
    let original_length: number | null = null;
    if (!editingId && originalStep2Quantity) {
      if (
        originalStep2Quantity.type === "area" &&
        typeof originalStep2Quantity.value === "number"
      ) {
        original_area = originalStep2Quantity.value;
      } else if (
        originalStep2Quantity.type === "length" &&
        typeof originalStep2Quantity.value === "number"
      ) {
        original_length = originalStep2Quantity.value;
      }
    }
    // --- End data preparation ---

    const newId = editingId || `manual_${uuidv4()}`;
    const elementDataForApi: BatchElementData = {
      id: newId,
      global_id: editingId
        ? editingElement?.global_id || ''
        : newId,
      type: data.type,
      name: data.name,
      type_name: data.name, // Use name as type_name for manual elements
      description: data.description,
      level: data.level,
      // --- Fields derived above ---
      quantity: apiQuantity,
      area: area,
      length: length,
      materials: apiMaterials,
      // --- End derived fields ---
      original_quantity: editingId ? undefined : originalStep2Quantity,
      original_area: editingId ? undefined : original_area,
      original_length: editingId ? undefined : original_length,
      classification: data.classification,
      properties: {}, // Start with empty properties for manual elements
      is_manual: true,
      is_structural: false, // Default values for manual elements
      is_external: false, // Default values for manual elements
    };

    try {

      const response = await apiClient.batchUpdateElements(selectedProject, [
        elementDataForApi,
      ]);

      if (response && response.success) {
        setKafkaSuccess(true);
        setShowManualForm(false);
        setEditingElement(null);

        // --- Update Local State Directly ---
        const newOrUpdatedElement: LocalIFCElement = {
          // Map fields from elementDataForApi to LocalIFCElement structure
          global_id: elementDataForApi.global_id || "",
          type: elementDataForApi.type,
          name: elementDataForApi.name,
          type_name: elementDataForApi.type_name,
          description: elementDataForApi.description,
          properties: elementDataForApi.properties ?? {},
          level: elementDataForApi.level,
          classification: elementDataForApi.classification, // Assuming structure matches
          materials:
            elementDataForApi.materials?.map((m) => ({
              // Ensure materials match LocalIFCElement structure
              name: m.name,
              fraction: m.fraction,
              volume: m.volume,
              unit: m.unit,
            })) ?? [],
          quantity: elementDataForApi.quantity, // Assuming structure matches
          original_quantity: elementDataForApi.original_quantity,
          area: elementDataForApi.area, // <<< Ensure these are included
          length: elementDataForApi.length,
          volume: null, // Keep top-level volume null as per previous request
          original_area: elementDataForApi.original_area, // <<< Ensure these are included
          original_length: elementDataForApi.original_length,
          is_manual: true,
          status: "active", // Assume successful save means active
          category: elementDataForApi.type, // Use type as category for manual? Or leave undefined?
          is_structural: elementDataForApi.is_structural ?? false,
          is_external: elementDataForApi.is_external ?? false,
          ebkph: elementDataForApi.classification?.id, // Extract from classification if possible
        };

        setIfcElements((prevElements) => {
          if (editingId) {
            // Update existing element
            return prevElements.map((el) =>
              el.global_id === editingId ? newOrUpdatedElement : el
            );
          } else {
            // Add new element
            return [...prevElements, newOrUpdatedElement];
          }
        });

        // --- Remove Refetch ---
        // fetchProjectElements(selectedProject); // <<< REMOVED
      } else {
        logger.error("Failed to save manual element:", response?.message);
        setKafkaError(
          `Fehler beim Speichern des manuellen Elements: ${
            response?.message || "Unbekannter Fehler"
          }`
        );
      }
    } catch (error) {
      logger.error("Error saving manual element:", error);
      setKafkaError(
        `Fehler: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setManualFormLoading(false);
    }
  };

  const handleManualCancel = () => {
    setShowManualForm(false);
    setEditingElement(null);
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

  // Excel import/export handlers
  const handleExcelExport = async (): Promise<void> => {
    setIsExporting(true);
    try {
      await ExcelService.exportToExcel(ifcElements, {
        fileName: `mengendaten-${selectedProject}-${new Date().toISOString().split('T')[0]}`,
        includeGuid: true,
        includeQuantities: true,
        includeUnits: true,
        includeMaterials: true
      });
      setLastExportTime(new Date());
      setExportCount(exportCount + 1);
      logger.info('Excel export completed successfully');
    } catch (error) {
      logger.error('Excel export failed:', error);
      setKafkaError('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelImport = () => {
    openExcelDialog();
  };

  const handleExcelImportComplete = (importedData: ExcelImportData[]) => {
    logger.info(`Excel import completed with ${importedData.length} elements`);
    setLastImportTime(new Date());
    setImportCount(importCount + 1);
    
    // First, track quantity changes in editedElements
    importedData.forEach(importItem => {
      if (importItem.quantity) {
        const originalElement = originalElements.get(importItem.global_id);
        
        // Track quantity changes if value or type differs from original
        const originalQty = originalElement?.quantity;
        
        // Explicitly detect when an element transitions from no/null quantity to having a quantity
        // This handles the case where originalQty is undefined or has null/undefined value
        const hadNoQuantity = !originalQty || originalQty.value === null || originalQty.value === undefined;
        const hasNewQuantity = importItem.quantity.value !== null && importItem.quantity.value !== undefined;
        
        // Detect changes in two scenarios:
        // 1. Element is getting a quantity for the first time (or replacing null with a value)
        // 2. Element had a quantity and it changed (value or type)
        const hasChanged = 
          (hadNoQuantity && hasNewQuantity) || // NEW: Explicitly handle adding quantity
          (originalElement && (
            (importItem.quantity.value ?? null) !== (originalQty?.value ?? null) ||
            (importItem.quantity.type ?? null) !== (originalQty?.type ?? null)
          ));
        
        if (hasChanged && originalElement) {
          // Use imported type, fall back to original type, then 'area'
          const quantityType = importItem.quantity.type || originalQty?.type || 'area';
          
          // Validate the quantity type before using
          const validTypes = ['area', 'length', 'count', 'volume'];
          if (!validTypes.includes(quantityType)) {
            logger.warn(`Invalid quantity type '${quantityType}' for element ${importItem.global_id}, skipping tracking`);
            return;
          }
          
          const originalValue = originalElement.quantity?.value ?? null;
          const newValue = importItem.quantity.value;
          
          // Use handleQuantityChange to track this edit
          handleQuantityChange(
            importItem.global_id,
            quantityType as 'area' | 'length' | 'count' | 'volume',
            originalValue,
            newValue?.toString() ?? ''
          );
        }
      }
    });
    
    // Update local elements with imported data
    setIfcElements(prevElements => {
      const updatedElements = [...prevElements];
      
      importedData.forEach(importItem => {
        const existingIndex = updatedElements.findIndex(el => el.global_id === importItem.global_id);
        
        if (existingIndex !== -1) {
          // Update existing element
          const updatedElement = { ...updatedElements[existingIndex] };
          
          if (importItem.quantity) {
            updatedElement.quantity = importItem.quantity;
          }
          if (importItem.area !== undefined) {
            updatedElement.area = importItem.area;
          }
          if (importItem.length !== undefined) {
            updatedElement.length = importItem.length;
          }
          if (importItem.volume !== undefined) {
            updatedElement.volume = importItem.volume;
          }
          if (importItem.name) {
            updatedElement.name = importItem.name;
          }
          if (importItem.type) {
            updatedElement.type = importItem.type;
          }
          if (importItem.level) {
            updatedElement.level = importItem.level;
          }
          if (importItem.classification_id) {
            updatedElement.classification_id = importItem.classification_id;
            updatedElement.ebkph = importItem.classification_id;
            // Infer classification name from code if not provided
            const inferredName = getEbkpNameFromCode(importItem.classification_id);
            if (inferredName) {
              updatedElement.classification_name = inferredName;
            }
          }
          if (importItem.classification_system || importItem.classification_id) {
            updatedElement.classification_system = importItem.classification_system || 'eBKP';
            // Infer classification name from code if not provided
            const inferredName = importItem.classification_id ? getEbkpNameFromCode(importItem.classification_id) : null;
            updatedElement.classification = {
              id: importItem.classification_id,
              name: inferredName,
              system: importItem.classification_system || 'eBKP'
            };
          }
          if (importItem.materials) {
            updatedElement.materials = importItem.materials;
          }

          // Reset status to pending since element data has been modified and needs re-confirmation
          updatedElement.status = 'pending';

          updatedElements[existingIndex] = updatedElement;
        } else {
          // Add new element
          // Infer classification name from code if provided
          const inferredName = importItem.classification_id ? getEbkpNameFromCode(importItem.classification_id) : null;

          const newElement: LocalIFCElement = {
            global_id: importItem.global_id,
            name: importItem.name || '',
            type: importItem.type || '',
            type_name: importItem.type,
            description: '',
            properties: {},
            material_volumes: null,
            level: importItem.level || null,
            classification_id: importItem.classification_id || null,
            classification_name: inferredName,
            classification_system: importItem.classification_system || (importItem.classification_id ? 'eBKP' : null),
            quantity: importItem.quantity || null,
            original_quantity: null,
            area: importItem.area || null,
            length: importItem.length || null,
            volume: importItem.volume || null,
            category: importItem.type,
            is_structural: false,
            is_external: false,
            ebkph: importItem.classification_id || null,
            materials: importItem.materials || null,
            classification: {
              id: importItem.classification_id,
              name: inferredName,
              system: importItem.classification_system || (importItem.classification_id ? 'eBKP' : null)
            },
            status: 'pending', // New imported elements should also require confirmation
            is_manual: true
          };
          
          updatedElements.push(newElement);
        }
      });
      
      return updatedElements;
    });
    
    setKafkaSuccess(true);
  };

  const handleDeleteConfirm = async () => {
    if (!elementToDelete || !selectedProject) return;

    const idToDelete = elementToDelete.global_id;
    const isSavedManual =
      elementToDelete.is_manual && elementToDelete.status === "active";

    setKafkaSuccess(null);
    setKafkaError(null);

    if (!isSavedManual) {
      // Scenario 1: Treat as local-only (either truly unsaved, or non-manual, or not active)
      setIfcElements((prev) => prev.filter((el) => el.global_id !== idToDelete));
      closeDeleteConfirm();
    } else {
      // Scenario 2: Element is considered saved and manual, call API
      try {
        await apiClient.deleteElement(selectedProject, idToDelete); // API call
        setIfcElements((prev) => prev.filter((el) => el.global_id !== idToDelete)); // Update local state
        setKafkaSuccess(true);
      } catch (error) {
        logger.error(`Error deleting element ${idToDelete}:`, error);
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
            <strong>{elementToDelete?.name || elementToDelete?.global_id}</strong>\ \"
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
                          logger.error("Error formatting date:", e);
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
                  <SmartExcelButton
                    onExport={handleExcelExport}
                    onImport={handleExcelImport}
                    isExporting={isExporting}
                    isImporting={isImporting}
                    lastExportTime={lastExportTime || undefined}
                    lastImportTime={lastImportTime || undefined}
                    exportCount={exportCount}
                    importCount={importCount}
                    disabled={!backendConnected || ifcLoading}
                  />
                )}

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

          {projectList.length === 0 && !projectsLoading && !projectsError && backendConnected && (
            <EmptyState
              icon="upload"
              title="Keine Projekte vorhanden"
              description="Um zu starten, laden Sie eine IFC-Datei über den IFC Uploader in ein Projekt hoch, oder wenden Sie sich an die zuständige Person für die Datenbereitstellung."
              actions={[
                {
                  label: "IFC Uploader öffnen",
                  onClick: () => navigateToIfcUploader(getCurrentPlugin()),
                  variant: "contained",
                  startIcon: <UploadIcon />
                }
              ]}
            />
          )}
          
          {selectedProject &&
            !ifcLoading &&
            ifcElements.length === 0 &&
            !ifcError && (
              <EmptyState
                icon="upload"
                title="Noch keine IFC-Daten in diesem Projekt"
                description="Für dieses Projekt sind noch keine IFC-Elemente verfügbar. Laden Sie eine IFC-Datei über den IFC Uploader in dieses Projekt hoch, oder kontaktieren Sie die zuständige Person."
                actions={[
                  {
                    label: "IFC Uploader öffnen",
                    onClick: () => navigateToIfcUploader(getCurrentPlugin()),
                    variant: "contained",
                    startIcon: <UploadIcon />
                  }
                ]}
              />
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
          hierarchicalGroups={hierarchicalGroups}
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

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        open={excelDialogOpen}
        onClose={closeExcelDialog}
        onImportComplete={handleExcelImportComplete}
        existingElements={ifcElements}
      />
    </div>
  );
};

export default MainPage;
