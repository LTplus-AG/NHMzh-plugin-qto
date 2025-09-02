import BuildIcon from "@mui/icons-material/Build";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import {
  Box,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import React, { useMemo } from "react";
import { IFCElement } from "../../types/types";
import { checkPersistedEdit } from "../../utils/elementEditChecks";
import { getZeroQuantityStyles, hasZeroQuantityInAnyType } from "../../utils/zeroQuantityHighlight";
import { ElementDisplayStatus, STATUS_CONFIG } from "../IfcElementsList";
import EbkpGroupRow from "./EbkpGroupRow";
import { tableStyles, groupRowConfig, tableSpacing, TABLE_COLUMNS } from "./tableConfig";
import { EditedQuantity, HierarchicalEbkpGroup } from "./types";

interface MainEbkpGroupRowProps {
  group: HierarchicalEbkpGroup;
  isExpanded: boolean;
  toggleExpand: (mainGroup: string) => void;
  expandedEbkp: string[];
  toggleExpandEbkp: (code: string) => void;
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



const MainEbkpGroupRow: React.FC<MainEbkpGroupRowProps> = ({
  group,
  isExpanded,
  toggleExpand,
  expandedEbkp,
  toggleExpandEbkp,
  expandedElements,
  toggleExpandElement,
  editedElements,
  handleQuantityChange,
  getElementDisplayStatus,
  handleEditManualClick,
  openDeleteConfirm,
  viewType,
}) => {
  // Get all elements from all subgroups
  const allElements = useMemo(() => {
    return group.subGroups.flatMap(subGroup => subGroup.elements);
  }, [group.subGroups]);

  // Check if any element in the main group has been edited LOCALLY (unsaved)
  const hasEditedElements = useMemo(
    () => allElements.some((el) => editedElements[el.global_id]),
    [allElements, editedElements]
  );

  // Check for manual elements
  const hasManualElements = useMemo(
    () => allElements.some((el) => el.is_manual),
    [allElements]
  );

  // Check if any element in the main group has PERSISTED edits
  const hasPersistedEdits = useMemo(
    () => allElements.some((el) => checkPersistedEdit(el)),
    [allElements]
  );

  // Check for zero quantities - compute once and derive both values
  const zeroQuantityElements = useMemo(
    () => allElements.filter((el) => {
      const quantityForCheck = {
        quantity: el.quantity?.value,
        area: el.area,
        length: el.length,
        volume: el.volume,
        hasZeroQuantityInGroup: el.hasZeroQuantityInGroup,
        groupedElements: el.groupedElements,
        type: el.type,
      };
      return hasZeroQuantityInAnyType(quantityForCheck);
    }),
    [allElements]
  );
  
  const hasZeroQuantities = zeroQuantityElements.length > 0;
  const elementsWithZeroQuantities = zeroQuantityElements.length;

  // Aggregate status for the main group based on priorities
  const aggregateStatus = useMemo(() => {
    let hasEdited = false;
    let hasPending = false;
    let hasLocalManual = false;
    let hasActive = false;

    for (const element of allElements) {
      const status = getElementDisplayStatus(element);
      if (status === "edited") {
        hasEdited = true;
        break; // Edited is highest priority for the group dot
      }
      if (status === "pending") {
        hasPending = true;
      }
      if (status === "manual") {
        hasLocalManual = true;
      }
      if (status === "active") {
        hasActive = true;
      }
    }

    // Determine final status based on priority
    if (hasEdited) return "edited";
    if (hasPending) return "pending";
    if (hasLocalManual) return "manual";
    if (hasActive) return "active";

    // Default if group is empty or only contains elements that somehow don't match above
    return "active";
  }, [allElements, getElementDisplayStatus]);

  // Get the color and label for the aggregate status
  const statusConfig = STATUS_CONFIG[aggregateStatus];
  const statusColor = statusConfig.color;
  let statusLabel = statusConfig.label;

  // Append manual info to tooltip if needed
  if (hasManualElements) {
    statusLabel += ` (enthält manuelle Elemente)`;
  }

  // Determine if ANY edit icon should be shown
  const showEditIcon = hasEditedElements || hasPersistedEdits;
  const editIconTooltip = hasEditedElements
    ? "Hauptgruppe enthält lokal bearbeitete (ungespeicherte) Elemente"
    : hasPersistedEdits
    ? "Hauptgruppe enthält Elemente mit überschriebenen Mengen"
    : "";
  return (
    <React.Fragment>
      <TableRow
        sx={getZeroQuantityStyles(hasZeroQuantities, {
          minHeight: tableSpacing.rowHeight.comfortable,
          backgroundColor: isExpanded
            ? "rgba(25, 118, 210, 0.08)"
            : hasEditedElements || hasPersistedEdits
            ? "rgba(255, 152, 0, 0.08)"
            : "rgba(0, 0, 0, 0.04)",
          "&:hover": {
            backgroundColor: isExpanded
              ? "rgba(25, 118, 210, 0.12)"
              : hasEditedElements || hasPersistedEdits
              ? "rgba(255, 152, 0, 0.12)"
              : "rgba(0, 0, 0, 0.08)",
            transform: "translateY(-1px)",
            boxShadow: `inset 4px 0 0 ${statusColor}, 0 4px 12px rgba(0,0,0,0.15)`,
          },
          cursor: "pointer",
          borderTop: "2px solid rgba(0, 0, 0, 0.08)",
          borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          boxShadow: `inset 4px 0 0 ${statusColor}`,
          transition: "all 0.2s ease-in-out",
        })}
        onClick={() => toggleExpand(group.mainGroup)}
      >
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...groupRowConfig.mainGroup.expandColumn,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconButton
            aria-label="expand main group"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(group.mainGroup);
            }}
            sx={{
              ...tableStyles.expandButton,
              p: 1,
              transition: "transform 0.2s ease",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            <ChevronRightIcon sx={{ fontSize: tableSpacing.iconSize.medium }} />
          </IconButton>
        </TableCell>

        <TableCell
          colSpan={3}
          sx={{
            ...tableStyles.dataCell,
            fontWeight: 700,
            fontSize: "1.1rem",
            py: 2,
            px: 2,
            minWidth: "600px", // Give more space for the content
            flex: "1 1 auto",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.1rem", color: "primary.main" }}>
                {group.mainGroup === "_OTHER_" ? "" : group.mainGroup}
              </Typography>
              
              {/* Status indicator dot with subtle design */}
              <Tooltip title={statusLabel} arrow placement="top">
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: statusColor,
                    display: "inline-block",
                    border: "1px solid rgba(255,255,255,0.8)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    flexShrink: 0,
                  }}
                />
              </Tooltip>

              {/* Small icons for additional context */}
              {hasManualElements && (
                <Tooltip title="Enthält manuelle Elemente" arrow placement="top">
                  <BuildIcon sx={{ 
                    fontSize: "0.75rem", 
                    color: "rgba(0,0,0,0.6)",
                    opacity: 0.7,
                  }} />
                </Tooltip>
              )}
              {showEditIcon && (
                <Tooltip title={editIconTooltip} arrow placement="top">
                  <EditIcon sx={{ 
                    fontSize: "0.75rem", 
                    color: "rgba(255,152,0,0.8)",
                    opacity: 0.8,
                  }} />
                </Tooltip>
              )}
            </Box>
            
            <Typography variant="body1" sx={{ fontWeight: 500, flex: "1 1 auto", minWidth: 0 }}>
              {group.mainGroupName}
            </Typography>
            
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'flex-end',
              minWidth: '200px', // Fixed minimum width for the info section
              flexShrink: 0,
              gap: 0.25
            }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <Typography variant="body2" sx={{ 
                  color: "text.secondary",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  whiteSpace: 'nowrap'
                }}>
                  {group.subGroups.length} Gruppen
                </Typography>
                <Typography variant="body2" sx={{ 
                  color: "text.secondary",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  whiteSpace: 'nowrap'
                }}>
                  •
                </Typography>
                <Typography variant="body2" sx={{ 
                  color: "text.secondary",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  whiteSpace: 'nowrap'
                }}>
                  {group.totalElements} Elemente
                </Typography>
              </Box>
              {elementsWithZeroQuantities > 0 && (
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 0.5,
                  backgroundColor: 'rgba(255, 152, 0, 0.08)',
                  borderRadius: 1,
                  px: 1,
                  py: 0.25
                }}>
                  <Typography variant="caption" sx={{ 
                    color: 'warning.main', 
                    fontWeight: 'bold',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap'
                  }}>
                    ⚠ {elementsWithZeroQuantities} ohne Mengen
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </TableCell>

        <TableCell
          sx={{
            ...tableStyles.dataCell,
            width: "140px",
            minWidth: "120px",
            textAlign: "center",
            py: 2,
            px: 1,
          }}
        >
          <Typography variant="body2" sx={{ 
            color: "text.secondary",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}>
            {statusConfig.label}
          </Typography>
        </TableCell>

        {/* Column 6: Empty - matches child menge column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 0 160px",
            minWidth: "140px",
            py: 2,
            px: 1,
          }}
        />

        {/* Column 7: Empty - matches child ebkpCode column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 1 120px",
            minWidth: "100px",
            py: 2,
            px: 1,
          }}
        />

        {/* Column 8: Empty - matches child ebkpName column */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            flex: "0 1 150px",
            minWidth: "120px",
            py: 2,
            px: 1,
          }}
        />
      </TableRow>

      <TableRow>
        <TableCell colSpan={TABLE_COLUMNS.length} sx={{ paddingBottom: 0, paddingTop: 0, borderBottom: "none" }}>
          <Collapse in={isExpanded} timeout="auto">
            <Box sx={{ pb: 2 }}>
              <Table sx={{ ...tableStyles.root }}>
                <TableBody>
                  {group.subGroups.map((subGroup) => (
                    <EbkpGroupRow
                      key={`${group.mainGroup}-ebkp-${subGroup.code}`}
                      group={subGroup}
                      isExpanded={expandedEbkp.includes(subGroup.code)}
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
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
};

export default MainEbkpGroupRow; 