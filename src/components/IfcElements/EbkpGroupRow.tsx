import React, { useMemo } from "react";
import {
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Collapse,
  Box,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  Tooltip,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import BuildIcon from "@mui/icons-material/Build";
import { IFCElement } from "../../types/types";
import ElementRow from "./ElementRow";
import { EditedQuantity } from "./types";
import { ElementDisplayStatus, STATUS_CONFIG } from "../IfcElementsList";

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
    quantityKey: "area" | "length",
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  getElementDisplayStatus: (element: IFCElement) => ElementDisplayStatus;
  handleEditManualClick: (element: IFCElement) => void;
  openDeleteConfirm: (element: IFCElement) => void;
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
}) => {
  // Check if any element in the group has been edited LOCALLY (unsaved)
  const hasEditedElements = useMemo(
    () => group.elements.some((el) => editedElements[el.id]),
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
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
          cursor: "pointer",
          backgroundColor: isExpanded
            ? "rgba(0, 0, 255, 0.04)"
            : hasEditedElements || hasPersistedEdits
            ? "rgba(255, 152, 0, 0.08)"
            : "inherit",
        }}
        onClick={() => toggleExpand(group.code)}
      >
        <TableCell>
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(group.code);
            }}
          >
            {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <strong>{group.code}</strong>
          {/* Manual Indicator */}
          {hasManualElements && (
            <Tooltip title="Gruppe enthält manuelle Elemente">
              <BuildIcon
                fontSize="inherit" // Smaller size within the cell
                sx={{
                  ml: 1,
                  verticalAlign: "middle",
                  color: "action.active",
                  fontSize: "1.1rem", // Slightly larger than in ElementRow maybe
                }}
              />
            </Tooltip>
          )}
          {/* Edit Indicator */}
          {showEditIcon && (
            <Tooltip title={editIconTooltip}>
              <EditIcon
                fontSize="inherit"
                sx={{
                  ml: hasManualElements ? 0.5 : 1, // Adjust spacing if manual icon is also present
                  verticalAlign: "middle",
                  color: "warning.main",
                  fontSize: "1.1rem",
                }}
              />
            </Tooltip>
          )}
        </TableCell>
        <TableCell>{group.name}</TableCell>
        <TableCell>{group.elements.length}</TableCell>
        <TableCell align="center">
          <Tooltip title={statusLabel}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                bgcolor: statusColor,
                display: "inline-block",
              }}
            />
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Expanded EBKP elements */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="h6" gutterBottom component="div">
                Elemente ({group.elements.length})
              </Typography>
              <TableContainer
                sx={{
                  border: "1px solid rgba(224, 224, 224, 1)",
                  borderRadius: 1,
                }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.05)" }}>
                      <TableCell width="50px" />
                      <TableCell>Type</TableCell>
                      <TableCell>Kategorie</TableCell>
                      <TableCell>Ebene</TableCell>
                      <TableCell width="150px" align="center">
                        Menge
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.elements.map((element, elementIndex) => (
                      <ElementRow
                        key={`${
                          group.code
                        }-${elementIndex}-${element.id.substring(0, 8)}`}
                        element={element}
                        groupCode={group.code}
                        elementIndex={elementIndex}
                        isExpanded={expandedElements.includes(element.id)}
                        toggleExpand={toggleExpandElement}
                        editedElement={editedElements[element.id]}
                        handleQuantityChange={handleQuantityChange}
                        getElementDisplayStatus={getElementDisplayStatus}
                        isParentGroupExpanded={isExpanded}
                        handleEditManualClick={handleEditManualClick}
                        openDeleteConfirm={openDeleteConfirm}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
};

export default EbkpGroupRow;
