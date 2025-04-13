import {
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Box,
  Tooltip,
  Button,
} from "@mui/material";
import { useEffect, useState, useMemo } from "react";
import { IFCElement } from "../types/types";
import EbkpGroupRow from "./IfcElements/EbkpGroupRow";
import ElementsHeader from "./IfcElements/ElementsHeader";
import { EditedQuantity } from "./IfcElements/types";
import ViewModeToggle from "./IfcElements/ViewModeToggle";
import StatusLegend from "./IfcElements/StatusLegend";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { EbkpGroup } from "./IfcElements/types";

// --- Status Definitions ---
// Refined statuses for clearer UI representation
export type ElementDisplayStatus = "pending" | "edited" | "active" | "manual";

export const STATUS_CONFIG: Record<
  ElementDisplayStatus,
  { color: string; label: string; description: string }
> = {
  pending: {
    // Was: IFC Pending
    color: "#ffcc80", // Lighter orange
    label: "Ausstehend (IFC)",
    description: "Vom IFC-Modell geladen, noch nicht bestätigt.",
  },
  edited: {
    // Was: Locally Edited (Pending Save)
    color: "#90caf9", // Lighter blue
    label: "Lokal Bearbeitet",
    description: "Änderungen sind noch nicht gespeichert.",
  },
  active: {
    // Was: Confirmed Active (from DB)
    color: "#81c784", // Lighter green
    label: "Bestätigt",
    description: "Zuletzt gespeicherter Zustand (IFC oder Manuell).",
  },
  manual: {
    // Was: Locally Added Manual (Pending Save)
    color: "#ffb74d", // Standard Orange 400
    label: "Manuell (Lokal)",
    description: "Manuell hinzugefügt, noch nicht gespeichert.",
  },
};
// --- End Status Definitions ---

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
  editedElements: Record<string, EditedQuantity>;
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length",
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  onEbkpStatusChange: (hasGroups: boolean) => void;
  targetIfcClasses?: string[];
  viewType?: string;
  setViewType?: (viewType: string) => void;
  onAddManualClick: () => void;
  isAddManualDisabled: boolean;
  ebkpGroups: EbkpGroup[];
  uniqueClassifications: Array<{ id: string; name: string; system: string }>;
  classificationFilter: string[];
  setClassificationFilter: (value: string[]) => void;
  handleEditManualClick: (element: IFCElement) => void;
  openDeleteConfirm: (element: IFCElement) => void;
}

const IfcElementsList = ({
  elements,
  loading,
  error,
  editedElements,
  handleQuantityChange,
  onEbkpStatusChange,
  targetIfcClasses = TARGET_IFC_CLASSES,
  viewType,
  setViewType,
  onAddManualClick,
  isAddManualDisabled,
  ebkpGroups,
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
  handleEditManualClick,
  openDeleteConfirm,
}: IfcElementsListProps) => {
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [_selectedElement, setSelectedElement] = useState<IFCElement | null>(
    null
  );

  // Determine the status of an element based on new priority
  const getElementDisplayStatus = (
    element: IFCElement
  ): ElementDisplayStatus => {
    const isLocallyEdited = editedElements.hasOwnProperty(element.id);

    // 1. Highest priority: Locally Edited (Blue) - Applies to both IFC and manual elements being edited
    if (isLocallyEdited) {
      return "edited";
    }

    // 2. If NOT locally edited, check DB status
    switch (element.status) {
      case "active":
        return "active"; // Green (for saved IFC and saved Manual)
      case "pending":
        // Only show pending for non-manual elements
        // Saved manual elements are already covered by "active"
        if (!element.is_manual) {
          return "pending"; // Lighter orange (for pending IFC)
        }
        // Fallthrough for manual elements with status 'pending' (should ideally become 'active' after save)
        break; // Go to fallback logic
      default:
        // Fallback if status is missing or unexpected
        break; // Go to fallback logic
    }

    // 3. Fallback Logic (if not locally edited and status wasn't 'active' or 'pending')
    if (element.is_manual) {
      // If it's a manual element without a definitive active/pending status (e.g., newly added locally before first save?)
      // Show as manual (orange)
      return "manual";
    } else {
      // Fallback for non-manual elements without a clear status (should ideally not happen)
      // Defaulting to 'active' might be safest visually, but log a warning.
      console.warn(
        `Element ${element.id} (IFC) has unexpected status: ${element.status}. Defaulting display to 'active'.`
      );
      return "active";
    }
  };

  // Calculate which statuses are present in the filtered list
  const presentStatuses = useMemo(() => {
    const statuses = new Set<ElementDisplayStatus>();
    ebkpGroups.forEach((group) => {
      group.elements.forEach((element) => {
        statuses.add(getElementDisplayStatus(element));
      });
    });
    return Array.from(statuses);
  }, [ebkpGroups, editedElements, getElementDisplayStatus]); // Dependency is correct

  // Call the callback when hasEbkpGroups changes
  useEffect(() => {
    onEbkpStatusChange(ebkpGroups.length > 0);
  }, [ebkpGroups.length, onEbkpStatusChange]);

  // Handle element selection from search
  const handleElementSelect = (element: IFCElement | null) => {
    setSelectedElement(element);

    if (element) {
      setClassificationFilter([]);

      // Find the EBKP code for the selected element
      const ebkpGroup = ebkpGroups.find((group) =>
        group.elements.some((e) => e.id === element.id)
      );

      if (ebkpGroup) {
        // Expand the EBKP group if not already expanded
        if (!expandedEbkp.includes(ebkpGroup.code)) {
          setExpandedEbkp((prev) => [...prev, ebkpGroup.code]);
        }

        // Expand the element if not already expanded
        if (!expandedElements.includes(element.id)) {
          setExpandedElements((prev) => [...prev, element.id]);
        }

        // Scroll to the element
        setTimeout(() => {
          const elementRow = document.getElementById(
            `element-row-${element.id}`
          );
          if (elementRow) {
            elementRow.scrollIntoView({ behavior: "smooth", block: "center" });
            // Highlight the element briefly
            elementRow.style.backgroundColor = "rgba(25, 118, 210, 0.1)";
            setTimeout(() => {
              elementRow.style.backgroundColor = "";
            }, 2000);
          }
        }, 100);
      }
    }
  };

  const toggleExpandEbkp = (code: string) => {
    setExpandedEbkp((prev) => {
      // If code is already in the array, remove it (collapse)
      if (prev.includes(code)) {
        return prev.filter((ebkpCode) => ebkpCode !== code);
      }
      // Otherwise add it to the array (expand)
      return [...prev, code];
    });
  };

  const toggleExpandElement = (id: string) => {
    setExpandedElements((prev) => {
      // If id is already in the array, remove it (collapse)
      if (prev.includes(id)) {
        return prev.filter((elementId) => elementId !== id);
      }
      // Otherwise add it to the array (expand)
      return [...prev, id];
    });
  };

  // If loading, show a loading indicator
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10"
        style={{ height: "100%", width: "100%" }}
      >
        <CircularProgress />
        <Typography variant="body2" className="mt-4">
          IFC-Daten werden geladen...
        </Typography>
      </div>
    );
  }

  // If there's an error, show the error message
  if (error) {
    return (
      <Alert severity="error" className="mb-4" style={{ height: "100%" }}>
        {error}
      </Alert>
    );
  }

  // If no elements and not loading, return nothing
  if (elements.length === 0) {
    return null;
  }

  // Count total elements in all EBKP groups
  const totalFilteredElements = ebkpGroups.reduce(
    (sum, group) => sum + group.elements.length,
    0
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ElementsHeader
        totalFilteredElements={totalFilteredElements}
        targetIfcClasses={targetIfcClasses}
        uniqueClassifications={uniqueClassifications}
        classificationFilter={classificationFilter}
        setClassificationFilter={setClassificationFilter}
        elements={elements}
        onElementSelect={handleElementSelect}
        viewType={viewType}
        ebkpGroups={ebkpGroups}
      />

      {/* Container for Title, Legend, and Toggle */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "row", // Use row layout
          justifyContent: "space-between", // Space out left and right groups
          alignItems: "center", // Vertically align items in the row
          px: 2,
          py: 1.5, // Adjusted padding
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          backgroundColor: "rgba(0, 0, 0, 0.02)",
        }}
      >
        {/* Left Group: Title, Manual Add Button */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography
            variant="subtitle1"
            fontWeight="medium"
            sx={{ whiteSpace: "nowrap", color: "black" }}
          >
            Elemente ({totalFilteredElements})
          </Typography>
          <Tooltip
            title={
              isAddManualDisabled
                ? "Projekt muss ausgewählt sein"
                : "Manuelles Element hinzufügen"
            }
          >
            <span>
              <Button
                variant="text"
                color="primary"
                size="small"
                startIcon={<AddCircleOutlineIcon />}
                onClick={onAddManualClick}
                disabled={isAddManualDisabled}
                sx={{
                  textTransform: "none",
                  fontWeight: "medium",
                  lineHeight: 1.2,
                }}
              >
                Manuell +
              </Button>
            </span>
          </Tooltip>
        </Box>

        {/* Right Group: Legend and View Toggle */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          {/* Render Legend inline if statuses are present */}
          {presentStatuses.length > 0 && (
            <StatusLegend presentStatuses={presentStatuses} />
          )}
          {/* View Mode Toggle Button */}
          {setViewType && (
            <ViewModeToggle
              viewType={viewType || "individual"}
              onChange={setViewType}
            />
          )}
        </Box>
      </Box>

      <TableContainer
        component={Paper}
        elevation={2}
        style={{
          width: "100%",
          flexGrow: 1,
          overflow: "auto",
          paddingTop: "12px",
        }}
      >
        <Table stickyHeader style={{ width: "100%", tableLayout: "fixed" }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}>
              <TableCell width="50px" />
              <TableCell>EBKP</TableCell>
              <TableCell>Bezeichnung</TableCell>
              <TableCell>Anzahl Elemente</TableCell>
              <TableCell width="80px">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ebkpGroups.map((group) => (
              <EbkpGroupRow
                key={`ebkp-${group.code}`}
                group={group}
                isExpanded={expandedEbkp.includes(group.code)}
                toggleExpand={toggleExpandEbkp}
                expandedElements={expandedElements}
                toggleExpandElement={toggleExpandElement}
                editedElements={editedElements}
                handleQuantityChange={handleQuantityChange}
                getElementDisplayStatus={getElementDisplayStatus}
                handleEditManualClick={handleEditManualClick}
                openDeleteConfirm={openDeleteConfirm}
              />
            ))}

            {ebkpGroups.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  Keine Elemente mit EBKP-Klassifikation gefunden
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;

export const ElementDetailHeader = () => (
  <TableHead>
    <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.04)" }}>
      <TableCell width="50px" />
      <TableCell>Type</TableCell>
      <TableCell>Kategorie</TableCell>
      <TableCell>Geschoss</TableCell>
      <TableCell width="150px" align="center">
        Menge
      </TableCell>
      <TableCell>Eigenschaften</TableCell>
    </TableRow>
  </TableHead>
);
