import React, { useMemo } from "react";
import {
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Collapse,
  Box,
  Tooltip,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import BuildIcon from "@mui/icons-material/Build";
import { IFCElement } from "../../types/types";
import VirtualizedElementList from "./VirtualizedElementList";
import { EditedQuantity } from "./types";
import { ElementDisplayStatus, STATUS_CONFIG } from "../IfcElementsList";
import { tableStyles } from "./tableConfig";

interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}

const checkPersistedEdit = (element: IFCElement): boolean => {
  const currentVal = element.quantity?.value;
  const originalVal = element.original_quantity?.value;
  if (
    currentVal !== null &&
    currentVal !== undefined &&
    !isNaN(currentVal) &&
    originalVal !== null &&
    originalVal !== undefined &&
    !isNaN(originalVal)
  ) {
    return Math.abs(currentVal - originalVal) > 1e-9;
  }
  return false;
};

interface EbkpGroupRowProps {
  group: EbkpGroup;
  isExpanded: boolean;
  toggleExpand: (code: string) => void;
  expandedElements: string[];
  toggleExpandElement: (id: string) => void;
  editedElements: Record<string, EditedQuantity>;
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length" | "count",
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  getElementDisplayStatus: (element: IFCElement) => ElementDisplayStatus;
  handleEditManualClick: (element: IFCElement) => void;
  openDeleteConfirm: (element: IFCElement) => void;
  viewType?: string;
}

const EbkpGroupRow: React.FC<EbkpGroupRowProps> = ({
  group,
  isExpanded,
  toggleExpand,
  expandedElements,
  toggleExpandElement,
  editedElements,
  handleQuantityChange,
  getElementDisplayStatus,
  handleEditManualClick,
  openDeleteConfirm,
  viewType,
}) => {
  // Check if any element in the group has been edited LOCALLY (unsaved)
  const hasEditedElements = useMemo(
    () => group.elements.some((el) => editedElements[el.global_id]),
    [group.elements, editedElements]
  );
  const hasManualElements = useMemo(
    () => group.elements.some((el) => el.is_manual),
    [group.elements]
  ); // Check for manual elements

  // Check if any element in the group has PERSISTED edits
  const hasPersistedEdits = useMemo(
    () => group.elements.some((el) => checkPersistedEdit(el)),
    [group.elements]
  );

  // Aggregate status for the group based on new priorities
  const aggregateStatus = React.useMemo(() => {
    let hasEdited = false;
    let hasPending = false;
    let hasLocalManual = false;
    let hasActive = false;

    for (const element of group.elements) {
      const status = getElementDisplayStatus(element);
      if (status === "edited") {
        hasEdited = true;
        break; // Edited is highest priority for the group dot
      }
      if (status === "pending") {
        hasPending = true;
      }
      if (status === "manual") {
        // Check for locally added manual
        hasLocalManual = true;
      }
      if (status === "active") {
        hasActive = true;
      }
    }

    // Determine final status based on priority
    if (hasEdited) return "edited";
    if (hasPending) return "pending";
    if (hasLocalManual) return "manual"; // Show manual orange if present and nothing higher priority
    if (hasActive) return "active";

    // Default if group is empty or only contains elements that somehow don't match above
    return "active";
  }, [group.elements, editedElements, getElementDisplayStatus]); // Ensure correct dependencies

  // Get the color and label for the aggregate status
  const statusConfig = STATUS_CONFIG[aggregateStatus];
  const statusColor = statusConfig.color;
  let statusLabel = statusConfig.label; // Use let to allow modification

  // Append manual info to tooltip if needed
  if (hasManualElements) {
    statusLabel += ` (enthält manuelle Elemente)`;
  }

  // Determine if ANY edit icon should be shown
  const showEditIcon = hasEditedElements || hasPersistedEdits;
  const editIconTooltip = hasEditedElements
    ? "Gruppe enthält lokal bearbeitete (ungespeicherte) Elemente"
    : hasPersistedEdits
    ? "Gruppe enthält Elemente mit überschriebenen Mengen"
    : ""; // Should not happen if showEditIcon is true

  return (
    <React.Fragment>
      <TableRow
        sx={{
          ...tableStyles.dataRow,
          "&:hover": { 
            backgroundColor: "rgba(25, 118, 210, 0.04)",
            transform: "translateY(-1px)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          },
          cursor: "pointer",
          backgroundColor: isExpanded
            ? "rgba(25, 118, 210, 0.08)"
            : hasEditedElements || hasPersistedEdits
            ? "rgba(255, 152, 0, 0.08)"
            : "inherit",
          transition: "all 0.2s ease-in-out",
          borderBottom: "2px solid rgba(0, 0, 0, 0.12)",
        }}
        onClick={() => toggleExpand(group.code)}
      >
        {/* Column 1: Expand - matches child table expand column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            width: "48px",
            minWidth: "48px",
            maxWidth: "48px",
            flex: "0 0 48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            py: 1.5,
            px: 1,
          }}
        >
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(group.code);
            }}
            sx={{
              ...tableStyles.expandButton,
              p: 0.5,
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            <ChevronRightIcon />
          </IconButton>
        </TableCell>

        {/* Column 2: EBKP Code & Bezeichnung - spans type + GUID columns */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "1 1 480px", // Combined flex of type + GUID columns
            minWidth: "320px",
            py: 1.5,
            px: 2,
          }}
        >
          <Box sx={{ 
            display: "flex", 
            alignItems: "center", 
            gap: 2,
            width: "100%",
            minWidth: 0,
          }}>
            <Box sx={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 1,
              minWidth: 0,
              flex: "0 0 auto",
            }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 700, 
                fontSize: "1rem",
                whiteSpace: "nowrap",
              }}>
                {group.code}
              </Typography>
              {hasManualElements && (
                <Tooltip title="Gruppe enthält manuelle Elemente" arrow>
                  <BuildIcon sx={{ fontSize: "0.9rem", color: "info.main" }} />
                </Tooltip>
              )}
              {showEditIcon && (
                <Tooltip title={editIconTooltip} arrow>
                  <EditIcon sx={{ fontSize: "0.9rem", color: "warning.main" }} />
                </Tooltip>
              )}
            </Box>
            <Typography variant="body2" sx={{ 
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: "1 1 auto",
              minWidth: 0,
            }}>
              {group.name || "-"}
            </Typography>
          </Box>
        </TableCell>

        {/* Column 3: Empty - matches child kategorie column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 1 160px",
            minWidth: "100px",
            py: 1.5,
            px: 1,
          }}
        />

        {/* Column 4: Element count - matches child ebene column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 1 120px",
            minWidth: "80px",
            display: "flex",
            alignItems: "center",
            py: 1.5,
            px: 1,
          }}
        >
          <Typography variant="body2" sx={{ 
            fontWeight: 600, 
            color: "primary.main",
            whiteSpace: "nowrap",
          }}>
            {group.elements.length} {viewType === "grouped" ? "Typen" : "Elemente"}
          </Typography>
        </TableCell>

        {/* Column 5: Status - matches child menge column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 0 140px",
            minWidth: "120px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            py: 1.5,
            px: 1,
          }}
        >
          <Tooltip title={statusLabel} arrow>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                bgcolor: statusColor,
                display: "inline-block",
                border: "2px solid white",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            />
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Expanded EBKP elements */}
      <TableRow sx={{ 
        width: "100%",
        minWidth: "800px",
      }}>
        <TableCell 
          colSpan={5}
          sx={{ 
            paddingBottom: 0, 
            paddingTop: 0, 
            borderBottom: "none",
            width: "100%",
          }}
        >
          <Collapse in={isExpanded} timeout="auto">
            <Box sx={{ margin: 1 }}>
              <Box sx={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                mb: 1 
              }}>
                <Typography variant="h6" component="div">
                  {viewType === "grouped" ? "Typen" : "Elemente"} ({group.elements.length})
                </Typography>
              </Box>
              <VirtualizedElementList
                elements={group.elements}
                groupCode={group.code}
                expandedElements={expandedElements}
                toggleExpandElement={toggleExpandElement}
                editedElements={editedElements}
                handleQuantityChange={handleQuantityChange}
                getElementDisplayStatus={getElementDisplayStatus}
                handleEditManualClick={handleEditManualClick}
                openDeleteConfirm={openDeleteConfirm}
                maxHeight={window.innerHeight * 0.7} // 70vh equivalent
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
};

export default EbkpGroupRow;
