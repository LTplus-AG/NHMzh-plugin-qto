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
} from "@mui/material";
import { useEffect, useState, useMemo } from "react";
import { IFCElement } from "../types/types";
import EbkpGroupRow from "./IfcElements/EbkpGroupRow";
import ElementsHeader from "./IfcElements/ElementsHeader";
import { useEbkpGroups } from "./IfcElements/hooks/useEbkpGroups";
import { EditedQuantity } from "./IfcElements/types";
import ViewModeToggle from "./IfcElements/ViewModeToggle";
import StatusLegend from "./IfcElements/StatusLegend";
import { quantityConfig } from "../types/types";

// --- Status Definitions ---
export type ElementDisplayStatus = "pending" | "edited" | "active";

export const STATUS_CONFIG: Record<
  ElementDisplayStatus,
  { color: string; label: string; description: string }
> = {
  pending: {
    color: "#ffcc80", // Lighter orange
    label: "Ausstehend",
    description: "Neu hochgeladen, Überprüfung erforderlich.",
  },
  edited: {
    color: "#90caf9", // Lighter blue
    label: "Bearbeitet",
    description: "Menge manuell angepasst.",
  },
  active: {
    color: "#81c784", // Lighter green
    label: "Bestätigt",
    description: "Menge aus Modell bestätigt.",
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
}: IfcElementsListProps) => {
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [classificationFilter, setClassificationFilter] = useState<string[]>(
    []
  );
  const [_selectedElement, setSelectedElement] = useState<IFCElement | null>(
    null
  );

  // Determine the status of an element
  const getElementDisplayStatus = (
    element: IFCElement
  ): ElementDisplayStatus => {
    // 0. Check transient edit state FIRST
    if (editedElements[element.id]) {
      // Perform a quick check if the current value in the map actually differs
      // This prevents marking as edited if user types and then reverts to original value
      const editData = editedElements[element.id];
      let currentValue: number | string | null | undefined;
      let originalPersistedValue: number | null | undefined;

      // Get current value from edit map (handle new/old structure)
      if (
        editData.newQuantity?.value !== undefined &&
        editData.newQuantity?.value !== null
      ) {
        currentValue = editData.newQuantity.value;
      } else {
        const config = quantityConfig[element.type] || { key: "area" };
        currentValue =
          config.key === "area" ? editData.newArea : editData.newLength;
      }

      // Get original persisted value (handle new/old structure)
      if (
        element.original_quantity &&
        element.original_quantity.value !== null &&
        element.original_quantity.value !== undefined
      ) {
        originalPersistedValue = element.original_quantity.value;
      } else {
        const config = quantityConfig[element.type] || { key: "area" };
        if (config.key === "area") {
          originalPersistedValue = element.original_area ?? undefined;
        } else if (config.key === "length") {
          originalPersistedValue = element.original_length ?? undefined;
        } else {
          originalPersistedValue =
            element.original_area ?? element.original_length ?? undefined;
        }
      }

      // Convert current value from edit state (might be string) to number for comparison
      const currentNumericValue =
        currentValue !== undefined &&
        currentValue !== null &&
        (typeof currentValue !== "string" || currentValue !== "")
          ? parseFloat(String(currentValue))
          : null;

      // If values are different (using tolerance), it's genuinely edited
      if (
        currentNumericValue !== null &&
        !isNaN(currentNumericValue) &&
        originalPersistedValue !== undefined &&
        originalPersistedValue !== null &&
        Math.abs(currentNumericValue - originalPersistedValue) > 1e-9
      ) {
        return "edited";
      }
      // If values are the same, or comparison isn't possible, it's not *currently* edited,
      // even though it's in the edit map. Fall through to check persisted status.
    }

    // 1. Check backend status if not currently being edited differently
    if (element.status === "pending") {
      return "pending";
    }

    // 2. If status is active (or null/undefined), check for PERSISTED quantity difference
    let currentQuantityValue: number | null | undefined = undefined;
    let originalQuantityValue: number | null | undefined = undefined;

    // Extract current quantity (prefer new structure)
    if (
      element.quantity &&
      element.quantity.value !== null &&
      element.quantity.value !== undefined
    ) {
      currentQuantityValue = element.quantity.value;
    } else {
      // Fallback to old fields if new structure is missing/null
      currentQuantityValue = element.area ?? element.length ?? undefined;
    }

    // Extract original quantity (prefer new structure)
    if (
      element.original_quantity &&
      element.original_quantity.value !== null &&
      element.original_quantity.value !== undefined
    ) {
      originalQuantityValue = element.original_quantity.value;
    } else {
      // Fallback to old fields (use appropriate one based on element type/current quantity type)
      const config = quantityConfig[element.type] || { key: "area" }; // Default check area
      if (config.key === "area") {
        originalQuantityValue = element.original_area ?? undefined;
      } else if (config.key === "length") {
        originalQuantityValue = element.original_length ?? undefined;
      } else {
        // Fallback if type has no specific config
        originalQuantityValue =
          element.original_area ?? element.original_length ?? undefined;
      }
    }

    // Perform the comparison with tolerance
    if (
      currentQuantityValue !== undefined &&
      currentQuantityValue !== null &&
      originalQuantityValue !== undefined &&
      originalQuantityValue !== null &&
      Math.abs(currentQuantityValue - originalQuantityValue) > 1e-9
    ) {
      // Use epsilon for float comparison
      return "edited";
    }

    // 3. Default to active if not pending and quantity doesn't differ (or comparison failed)
    return "active";
  };

  // Use only the EBKP groups hook, not the element editing hook
  const { ebkpGroups, uniqueClassifications, hasEbkpGroups } = useEbkpGroups(
    elements,
    classificationFilter,
    viewType
  );

  // Calculate which statuses are present in the filtered list
  const presentStatuses = useMemo(() => {
    const statuses = new Set<ElementDisplayStatus>();
    ebkpGroups.forEach((group) => {
      group.elements.forEach((element) => {
        statuses.add(getElementDisplayStatus(element));
      });
    });
    return Array.from(statuses);
  }, [ebkpGroups, editedElements]); // Recalculate when groups or edits change

  // Call the callback when hasEbkpGroups changes
  useEffect(() => {
    onEbkpStatusChange(hasEbkpGroups);
  }, [hasEbkpGroups, onEbkpStatusChange]);

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
        {/* Left Group: Title and Legend */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography
            variant="subtitle1"
            fontWeight="medium"
            sx={{ whiteSpace: "nowrap" }}
          >
            Elemente ({totalFilteredElements})
          </Typography>
          {/* Render Legend inline if statuses are present */}
          {presentStatuses.length > 0 && (
            <StatusLegend presentStatuses={presentStatuses} />
          )}
        </Box>

        {/* Right Group: Toggle Button */}
        {setViewType && (
          <ViewModeToggle
            viewType={viewType || "individual"}
            onChange={setViewType}
          />
        )}
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
