import { useState, useEffect, useMemo } from "react";
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
  IconButton,
} from "@mui/material";
import { IFCElement } from "../types/types";
import EbkpGroupRow from "./IfcElements/EbkpGroupRow";
import MainEbkpGroupRow from "./IfcElements/MainEbkpGroupRow";
import ElementsHeader from "./IfcElements/ElementsHeader";
import StatusLegend from "./IfcElements/StatusLegend";
import ViewModeToggle from "./IfcElements/ViewModeToggle";
import { EditedQuantity } from "./IfcElements/types";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { EbkpGroup } from "./IfcElements/types";
import { HierarchicalEbkpGroup } from "./IfcElements/types";
import { tableStyles, TABLE_COLUMNS, getColumnStyle } from "./IfcElements/tableConfig";

// --- Status Definitions ---
export type ElementDisplayStatus = "pending" | "edited" | "active" | "manual";

export const STATUS_CONFIG: Record<
  ElementDisplayStatus,
  { color: string; label: string; description: string }
> = {
  pending: {
    color: "#ffcc80", // Lighter orange
    label: "Ausstehend (IFC)",
    description: "Vom IFC-Modell geladen, noch nicht bestätigt.",
  },
  edited: {
    color: "#90caf9", // Lighter blue
    label: "Lokal Bearbeitet",
    description: "Änderungen sind noch nicht gespeichert.",
  },
  active: {
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
    quantityKey: "area" | "length" | "count",
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
  hierarchicalGroups?: HierarchicalEbkpGroup[];
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
  hierarchicalGroups,
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
  handleEditManualClick,
  openDeleteConfirm,
}: IfcElementsListProps) => {
  const [expandedMainGroups, setExpandedMainGroups] = useState<string[]>([]);
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [_selectedElement, setSelectedElement] = useState<IFCElement | null>(
    null
  );

  // Determine the status of an element based on new priority
  const getElementDisplayStatus = (
    element: IFCElement
  ): ElementDisplayStatus => {
    const isLocallyEdited = Object.prototype.hasOwnProperty.call(editedElements, element.global_id);

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
        `Element ${element.global_id} (IFC) has unexpected status: ${element.status}. Defaulting display to 'active'.`
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
        group.elements.some((e) => e.global_id === element.global_id)
      );

      if (ebkpGroup) {
        // If using hierarchical view, also expand the main group
        if (hierarchicalGroups) {
          const mainGroup = hierarchicalGroups.find((mg) =>
            mg.subGroups.some((sg) => sg.code === ebkpGroup.code)
          );
          
          if (mainGroup && !expandedMainGroups.includes(mainGroup.mainGroup)) {
            setExpandedMainGroups((prev) => [...prev, mainGroup.mainGroup]);
          }
        }

        // Expand the EBKP group if not already expanded
        if (!expandedEbkp.includes(ebkpGroup.code)) {
          setExpandedEbkp((prev) => [...prev, ebkpGroup.code]);
        }

        // Expand the element if not already expanded
        if (!expandedElements.includes(element.global_id)) {
          setExpandedElements((prev) => [...prev, element.global_id]);
        }

        // Scroll to the element
        setTimeout(() => {
          const elementRow = document.getElementById(
            `element-row-${element.global_id}`
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

  const toggleExpandMainGroup = (mainGroup: string) => {
    setExpandedMainGroups((prev) => {
      if (prev.includes(mainGroup)) {
        return prev.filter((group) => group !== mainGroup);
      }
      return [...prev, mainGroup];
    });
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

  // Determine if all groups are expanded
  const areAllGroupsExpanded = useMemo(() => {
    if (hierarchicalGroups) {
      // Check if all main groups are expanded
      const allMainGroupsExpanded = hierarchicalGroups.every(group => 
        expandedMainGroups.includes(group.mainGroup)
      );
      
      // Check if all sub-groups are expanded
      const allSubGroupsCodes = hierarchicalGroups.flatMap(group => 
        group.subGroups.map(subGroup => subGroup.code)
      );
      const allSubGroupsExpanded = allSubGroupsCodes.every(code => 
        expandedEbkp.includes(code)
      );
      
      return allMainGroupsExpanded && allSubGroupsExpanded;
    } else {
      // For flat view, check if all EBKP groups are expanded
      return ebkpGroups.every(group => expandedEbkp.includes(group.code));
    }
  }, [hierarchicalGroups, ebkpGroups, expandedMainGroups, expandedEbkp]);

  // Function to expand all groups
  const expandAllGroups = () => {
    if (hierarchicalGroups) {
      // Expand all main groups
      const allMainGroups = hierarchicalGroups.map(group => group.mainGroup);
      setExpandedMainGroups(allMainGroups);
      
      // Expand all sub-groups
      const allSubGroupsCodes = hierarchicalGroups.flatMap(group => 
        group.subGroups.map(subGroup => subGroup.code)
      );
      setExpandedEbkp(allSubGroupsCodes);
    } else {
      // For flat view, expand all EBKP groups
      const allCodes = ebkpGroups.map(group => group.code);
      setExpandedEbkp(allCodes);
    }
  };

  // Function to collapse all groups
  const collapseAllGroups = () => {
    setExpandedMainGroups([]);
    setExpandedEbkp([]);
    setExpandedElements([]); // Also collapse all elements
  };

  // Toggle expand/collapse all
  const toggleExpandAll = () => {
    if (areAllGroupsExpanded) {
      collapseAllGroups();
    } else {
      expandAllGroups();
    }
  };

  // Count expanded groups for dynamic header display
  const expandedGroupsCount = useMemo(() => {
    if (hierarchicalGroups) {
      return expandedMainGroups.length;
    }
    return expandedEbkp.length;
  }, [hierarchicalGroups, expandedMainGroups, expandedEbkp]);

  const totalGroupsCount = useMemo(() => {
    if (hierarchicalGroups) {
      return hierarchicalGroups.length;
    }
    return ebkpGroups.length;
  }, [hierarchicalGroups, ebkpGroups]);

  // Count total elements
  const totalFilteredElements = hierarchicalGroups
    ? hierarchicalGroups.reduce((sum, group) => sum + group.totalElements, 0)
    : ebkpGroups.reduce((sum, group) => sum + group.elements.length, 0);

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
              viewType={viewType || "grouped"}
              onChange={setViewType}
            />
          )}
        </Box>
      </Box>

      <TableContainer
        component={Paper}
        elevation={2}
        sx={{
          width: "100%",
          flexGrow: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          pt: 1.5,
        }}
      >
        <Box sx={{ 
          width: "100%", 
          overflowX: "auto",
          overflowY: "auto",
          flexGrow: 1,
          minWidth: 0, // Allow the box to shrink but table inside maintains its width
        }}>
          <Table stickyHeader sx={{
            ...tableStyles.root,
            minWidth: "900px", // Ensure table doesn't shrink below this
          }}>
            <TableHead>
              <TableRow sx={{ ...tableStyles.headerRow, backgroundColor: "rgba(0, 0, 0, 0.04)" }}>
                <TableCell 
                  sx={{
                    ...tableStyles.headerCell,
                    flex: "0 0 48px",
                    minWidth: "48px",
                    py: 2,
                    fontWeight: 'bold',
                  }}
                >
                  <Tooltip
                    title={areAllGroupsExpanded ? "Alle zuklappen" : "Alle aufklappen"}
                  >
                    <IconButton
                      size="small"
                      onClick={toggleExpandAll}
                      sx={{
                        p: 0.5,
                        color: "primary.main",
                        backgroundColor: areAllGroupsExpanded ? "rgba(25, 118, 210, 0.08)" : "transparent",
                        "&:hover": {
                          backgroundColor: "rgba(25, 118, 210, 0.12)",
                        },
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        transform: areAllGroupsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
                <TableCell 
                  sx={{
                    ...tableStyles.headerCell,
                    flex: "1 1 480px", // Combined width of type + GUID columns
                    minWidth: "320px",
                    py: 2,
                    fontWeight: 'bold',
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span>{hierarchicalGroups ? "EBKP Gruppe / Bezeichnung" : "EBKP / Bezeichnung"}</span>
                    {expandedGroupsCount > 0 && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: "primary.main",
                          backgroundColor: "rgba(25, 118, 210, 0.08)",
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          fontWeight: 500,
                        }}
                      >
                        {expandedGroupsCount}/{totalGroupsCount} aufgeklappt
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell 
                  sx={{
                    ...tableStyles.headerCell,
                    flex: "0 1 160px",
                    minWidth: "100px",
                    py: 2,
                    fontWeight: 'bold',
                  }}
                />
                <TableCell 
                  sx={{
                    ...tableStyles.headerCell,
                    flex: "0 1 120px",
                    minWidth: "80px",
                    display: "flex",
                    alignItems: "center",
                    py: 2,
                    fontWeight: 'bold',
                  }}
                >
                  {viewType === "grouped" ? "Anzahl Typen" : "Anzahl Elemente"}
                </TableCell>
                <TableCell 
                  sx={{
                    ...tableStyles.headerCell,
                    flex: "0 0 140px",
                    minWidth: "120px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 2,
                    fontWeight: 'bold',
                  }}
                >
                  Status {presentStatuses.length > 0 && 
                    <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>
                      ({presentStatuses.length})
                    </Typography>
                  }
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {hierarchicalGroups ? (
                // Use hierarchical view
                hierarchicalGroups.map((mainGroup) => (
                  <MainEbkpGroupRow
                    key={`main-${mainGroup.mainGroup}`}
                    group={mainGroup}
                    isExpanded={expandedMainGroups.includes(mainGroup.mainGroup)}
                    toggleExpand={toggleExpandMainGroup}
                    expandedEbkp={expandedEbkp}
                    toggleExpandEbkp={toggleExpandEbkp}
                    expandedElements={expandedElements}
                    toggleExpandElement={toggleExpandElement}
                    editedElements={editedElements}
                    handleQuantityChange={handleQuantityChange}
                    getElementDisplayStatus={getElementDisplayStatus}
                    handleEditManualClick={handleEditManualClick}
                    openDeleteConfirm={openDeleteConfirm}
                    viewType={viewType}
                  />
                ))
              ) : (
                // Use flat view (fallback)
                ebkpGroups.map((group) => (
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
                    viewType={viewType}
                  />
                ))
              )}

              {ebkpGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    Keine Elemente mit EBKP-Klassifikation gefunden
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;

export const ElementDetailHeader = () => (
  <TableHead>
    <TableRow sx={tableStyles.headerRow}>
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[0]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      />
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[1]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      >
        Type
      </TableCell>
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[2]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      >
        GUID
      </TableCell>
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[3]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      >
        Kategorie
      </TableCell>
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[4]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      >
        Ebene
      </TableCell>
      <TableCell 
        sx={{
          ...tableStyles.headerCell,
          ...getColumnStyle(TABLE_COLUMNS[5]),
          backgroundColor: "#f8f9fa",
          zIndex: 99,
        }}
      >
        Menge
      </TableCell>
    </TableRow>
  </TableHead>
);
