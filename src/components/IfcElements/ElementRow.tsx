import React, { useMemo } from "react";
import {
  TableRow,
  TableCell,
  IconButton,
  Typography,
  Collapse,
  Box,
  Tooltip,
  TextField,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import BuildIcon from "@mui/icons-material/Build";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { IFCElement, quantityConfig } from "../../types/types";
import MaterialsTable from "./MaterialsTable";
import { EditedQuantity } from "./types";
import { ElementDisplayStatus } from "../IfcElementsList";
import CopyableText from "../ui/CopyableText";
import { TABLE_COLUMNS, getColumnStyle, tableStyles } from "./tableConfig";
import { hasZeroQuantityInAnyType, getZeroQuantityStyles, getZeroQuantityTooltip } from "../../utils/zeroQuantityHighlight";
import { getEbkpNameFromCode } from "../../data/ebkpData";

interface ElementRowProps {
  element: IFCElement;
  groupCode: string;
  elementIndex: number;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  editedElement?: EditedQuantity; // Updated to use EditedQuantity type
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length" | "count", // Identify which quantity is changing
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  getElementDisplayStatus: (element: IFCElement) => ElementDisplayStatus; // Add prop type
  handleEditManualClick: (element: IFCElement) => void; // <<< Destructure prop
}

const getQuantityValue = (
  element: IFCElement,
  quantityType: "area" | "length" | "count"
): number | null | undefined => {
  // 1. Prioritize direct top-level properties first
  if (quantityType === "area" && typeof element.area === "number") {
    return element.area;
  }
  if (quantityType === "length" && typeof element.length === "number") {
    return element.length;
  }

  // 2. Fallback: Check the element.quantity object if top-level fails
  if (
    element.quantity &&
    typeof element.quantity === "object" &&
    element.quantity.type === quantityType &&
    typeof element.quantity.value === "number"
  ) {
    return element.quantity.value;
  }

  // 3. If neither is found, return undefined (or null/0 as desired)
  return undefined;
};

// <<< ADDED: Helper to check for persisted quantity difference >>>
const checkPersistedEdit = (element: IFCElement): boolean => {
  const currentVal = element.quantity?.value;
  const originalVal = element.original_quantity?.value;

  // Ensure both values are valid numbers before comparing
  if (
    currentVal !== null &&
    currentVal !== undefined &&
    !isNaN(currentVal) &&
    originalVal !== null &&
    originalVal !== undefined &&
    !isNaN(originalVal)
  ) {
    // Use tolerance for float comparison
    return Math.abs(currentVal - originalVal) > 1e-9;
  }
  return false; // Not considered a persisted edit if values are missing/invalid
};

const ElementRow: React.FC<ElementRowProps> = ({
  element,
  groupCode,
  elementIndex,
  isExpanded,
  toggleExpand,
  editedElement,
  handleQuantityChange,
  getElementDisplayStatus, // Destructure prop
  handleEditManualClick, // <<< Destructure prop
}) => {


  const category = element.category || element.type;
  const level = element.level || "unbekannt";
  const uniqueKey = `${groupCode}-${elementIndex}-${element.global_id.substring(
    0,
    8
  )}`;

  // --- Determine Quantity Key and Unit to Display/Edit ---
  // Always use the quantity type based on IFC class configuration
  const defaultTypeConfig = quantityConfig[element.type] || {
    key: "area",
    unit: "m²",
  };

  const displayQuantityKey: "area" | "length" | "count" = defaultTypeConfig.key;
  const displayUnit: string = defaultTypeConfig.unit;
  
  // Note: We prioritize the IFC class-based configuration over backend quantity types
  // to ensure consistent display (e.g., IfcBeam always shows length, not area)
  // --- End Quantity Key/Unit Determination ---

  // Determine display status
  const displayStatus = getElementDisplayStatus(element);

  // Check if this element is currently being edited locally (unsaved)
  const isLocallyEdited = editedElement !== undefined;

  // Check for persisted quantity difference using helper
  const isPersistedEdit = useMemo(
    () => checkPersistedEdit(element),
    [element.quantity, element.original_quantity]
  );

  // Get the original quantity if it was edited
  const getOriginalQuantityValue = (): number | null | undefined => {
    if (isLocallyEdited && editedElement) {
      // Try new schema first
      if (
        editedElement.originalQuantity &&
        typeof editedElement.originalQuantity === "object"
      ) {
        return editedElement.originalQuantity.value;
      }
      // Fallback to old schema fields
      return displayQuantityKey === "area"
        ? editedElement.originalArea
        : editedElement.originalLength;
    }

    // Get from non-edited element (original_quantity or original_area)
    if (
      element.original_quantity &&
      typeof element.original_quantity === "object" &&
      element.original_quantity.type === displayQuantityKey // Check type matches
    ) {
      return element.original_quantity.value;
    }
    // Fallback for non-edited (old schema or if type doesn't match)
    if (displayQuantityKey === "area") return element.original_area;
    if (displayQuantityKey === "length") return element.original_length; // Assuming original_length might exist
    return element.original_area; // Final fallback to original_area
  };

  const originalQuantityValue = getOriginalQuantityValue();

  // Format decimal number - don't show trailing zeros
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";

    // Convert to string with 3 decimal places first
    const formatted = num.toFixed(3);

    // Remove trailing zeros and decimal point if needed
    return formatted.replace(/\.?0+$/, "");
  };

  // Format value for display in the TextField
  const getDisplayValue = () => {
    // PRIORITIZE showing the value from the transient edit state if it exists
    if (editedElement) {
      let valueFromEditState: number | string | null | undefined = undefined;
      // Try new structure first
      if (
        editedElement.newQuantity?.value !== undefined &&
        editedElement.newQuantity?.value !== null
      ) {
        valueFromEditState = editedElement.newQuantity.value;
      }
      // Fallback to older properties if new one isn't populated by the hook yet
      else if (
        displayQuantityKey === "area" &&
        editedElement.newArea !== undefined &&
        editedElement.newArea !== null
      ) {
        valueFromEditState = editedElement.newArea;
      } else if (
        displayQuantityKey === "length" &&
        editedElement.newLength !== undefined &&
        editedElement.newLength !== null
      ) {
        valueFromEditState = editedElement.newLength;
      }

      // If we found a value in the edit state, format and return it
      if (valueFromEditState !== undefined && valueFromEditState !== null) {
        // Return the raw string if it's explicitly an empty string (user deleted input)
        if (
          typeof valueFromEditState === "string" &&
          valueFromEditState === ""
        ) {
          return "";
        }
        // Otherwise, try to format as number
        const numericValue =
          typeof valueFromEditState === "string"
            ? parseFloat(valueFromEditState)
            : valueFromEditState;
        if (!isNaN(numericValue)) {
          // Format valid numbers (don't format if it was originally a non-empty string like partial input "1.")
          return typeof valueFromEditState === "number"
            ? formatNumber(numericValue)
            : valueFromEditState;
        }
        // If it wasn't empty string or a number, return original value (e.g. during partial input like "1.")
        // Fallthrough will handle this by returning the original value below
      }
      // <<< ADDED FALLBACK >>>
      // If editedElement exists but didn't yield a valid value, fall through to show base element value
      // (This handles the case right after adding a manual element where edit state might exist but be empty)
    }

    // If no transient edit state OR if editedElement fallback occurs, show the value from the main element prop
    const valueToFormat = getQuantityValue(element, displayQuantityKey);
    let finalDisplayValue = "";
    if (valueToFormat !== null && valueToFormat !== undefined) {
      finalDisplayValue = formatNumber(valueToFormat);
    }



    return finalDisplayValue;
  };

  // <<< Calculate display value outside the return statement >>>
  const displayValue = getDisplayValue();
  
  // Check if element has zero quantity - create a compatible object
  const quantityForCheck = {
    quantity: element.quantity?.value,
    area: element.area,
    length: element.length,
    volume: element.volume,
    hasZeroQuantityInGroup: element.hasZeroQuantityInGroup,
    groupedElements: element.groupedElements,
    type: element.type,
  };
  const hasZeroQuantity = hasZeroQuantityInAnyType(quantityForCheck);

  return (
    <React.Fragment>
      <TableRow
        id={`element-row-${element.global_id}`}
        sx={getZeroQuantityStyles(hasZeroQuantity, {
          ...tableStyles.dataRow,
          "&:hover": { backgroundColor: "rgba(25, 118, 210, 0.04)" },
          cursor: "pointer",
          backgroundColor: isExpanded
            ? "rgba(0, 0, 255, 0.04)" // Expanded background
            : isLocallyEdited
            ? "rgba(144, 202, 249, 0.1)" // Local Edit color (using 'edited' status color)
            : displayStatus === "manual"
            ? "rgba(255, 183, 77, 0.1)" // Manual unsaved color (using 'manual' status color)
            : displayStatus === "pending"
            ? "rgba(255, 204, 128, 0.1)" // Pending color
            : elementIndex % 2 === 1
            ? "rgba(0, 0, 0, 0.02)" // Zebra stripe for odd rows
            : "inherit", // Default
          transition: "background-color 0.3s ease",
        })}
        onClick={() => toggleExpand(element.global_id)}
        title={hasZeroQuantity ? getZeroQuantityTooltip(element.type_name || element.name || element.type, !!(element.groupedElements && element.groupedElements > 1)) : undefined}
      >
        {/* Column 1: Expand */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[0]),
            py: 1,
            px: 1,
            justifyContent: "center",
          }}
        >
          {(isExpanded || !element.is_manual) && (
            <IconButton
              aria-label="expand element"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(element.global_id);
              }}
              sx={{
                ...tableStyles.expandButton,
                p: 0.5,
              }}
            >
                              <ChevronRightIcon sx={{ 
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease'
                }} />
            </IconButton>
          )}
          {!isExpanded && element.is_manual && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Tooltip title="Bearbeiten">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditManualClick(element);
                  }}
                  sx={{ ...tableStyles.expandButton, p: "1px" }}
                >
                  <EditNoteIcon sx={{ fontSize: "0.9rem" }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </TableCell>

        {/* Column 2: Type */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[1]),
            py: 1,
            px: 1,
          }}
        >
          <Box sx={{ 
            display: "flex", 
            alignItems: "center", 
            flexWrap: "wrap", 
            gap: 0.5,
            width: "100%",
            minWidth: 0,
          }}>
            <Typography sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: "1 1 auto",
              minWidth: 0,
            }}>
              {element.type_name || element.name || element.type}
            </Typography>
            {element.is_manual && (
              <Tooltip title="Manuell hinzugefügtes Element">
                <BuildIcon sx={{ fontSize: "0.9rem", color: "action.active", flex: "0 0 auto" }} />
              </Tooltip>
            )}
            {(isLocallyEdited || isPersistedEdit) && !element.is_manual && (
              <Tooltip
                title={
                  isLocallyEdited
                    ? "Lokal bearbeitet (ungespeichert)"
                    : "Menge wurde überschrieben"
                }
              >
                <EditIcon sx={{ fontSize: "0.9rem", color: "warning.main", flex: "0 0 auto" }} />
              </Tooltip>
            )}
            {element.groupedElements && element.groupedElements > 1 && (
              <Typography
                variant="caption"
                sx={{
                  display: "inline-block",
                  color: "text.secondary",
                  backgroundColor: element.hasPropertyDifferences
                    ? "rgba(255, 152, 0, 0.08)"
                    : "rgba(25, 118, 210, 0.05)",
                  borderRadius: "4px",
                  padding: "0 4px",
                  fontWeight: "medium",
                  flex: "0 0 auto",
                }}
              >
                {element.groupedElements}x
                {element.hasPropertyDifferences && "*"}
              </Typography>
            )}
          </Box>
        </TableCell>

        {/* Column 3: GUID */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[2]),
            py: 1,
            px: 1,
          }}
        >
          <CopyableText text={element.global_id} showFullText={true} />
        </TableCell>

        {/* Column 4: Kategorie */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[3]),
            py: 1,
            px: 1,
          }}
        >
          <Typography sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}>
            {category}
          </Typography>
        </TableCell>

        {/* Column 5: Ebene */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[4]),
            py: 1,
            px: 1,
          }}
        >
          <Typography sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}>
            {level}
          </Typography>
        </TableCell>

        {/* Column 6: Menge */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[5]),
            py: 1,
            px: 1,
            ...((isLocallyEdited || isPersistedEdit) && {
              backgroundColor: "rgba(255, 152, 0, 0.08)",
            }),
          }}
        >
          <Box sx={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "flex-end", 
            width: "100%",
            gap: 0.5,
          }}>
            {element.groupedElements && element.groupedElements > 1 ? (
              <Tooltip
                title="Bearbeitung nicht möglich, da mehrere Elemente gruppiert angezeigt werden. Wechseln Sie zur Einzelansicht um Mengen zu bearbeiten."
                placement="top"
                arrow
              >
                <span style={{ width: "100%" }}>
                  <TextField
                    variant="outlined"
                    size="small"
                    type="number"
                    inputProps={{
                      step: "0.001",
                      style: { textAlign: "right" }, // Align text right
                    }}
                    value={displayValue} // <<< NEW: Use pre-calculated variable
                    disabled={true}
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      width: "80px",
                      mr: 0.5,
                      "& .MuiInputBase-root": {
                        borderRadius: 1,
                        fontSize: "0.875rem",
                      },
                      "& .MuiInputBase-input": {
                        py: 0.5,
                        px: 1,
                        textAlign: "right",
                      },
                      "& .Mui-disabled": {
                        WebkitTextFillColor: "rgba(0, 0, 0, 0.6) !important",
                        cursor: "not-allowed",
                        backgroundColor: "rgba(0, 0, 0, 0.02)",
                      },
                      "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
                        {
                          WebkitAppearance: "none",
                          margin: 0,
                        },
                      "& input[type=number]": {
                        MozAppearance: "textfield",
                      },
                    }}
                  />
                </span>
              </Tooltip>
            ) : (
              <TextField
                size="small"
                type="text"
                inputMode="decimal"
                inputProps={{
                  step: "0.001",
                  style: { textAlign: "right" }, // Align text right
                }}
                value={displayValue} // <<< NEW: Use pre-calculated variable
                onChange={(e) => {
                  // If this is a grouped element, don't allow direct editing
                  if (element.groupedElements && element.groupedElements > 1) {
                    return;
                  }

                  handleQuantityChange(
                    element.global_id,
                    displayQuantityKey,
                    originalQuantityValue, // Pass the determined original value
                    e.target.value
                  );
                }}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  width: "80px",
                  mr: 0.5,
                  "& .MuiInputBase-root": {
                    borderRadius: 1,
                    fontSize: "0.875rem",
                  },
                  "& .MuiInputBase-input": {
                    py: 0.5,
                    px: 1,
                    textAlign: "right",
                  },
                  "& .MuiOutlinedInput-root": {
                    "&.Mui-focused fieldset": {
                      borderColor:
                        isLocallyEdited || isPersistedEdit
                          ? "warning.main"
                          : "primary.main",
                    },
                    "& fieldset": {
                      borderColor:
                        isLocallyEdited || isPersistedEdit
                          ? "warning.main"
                          : undefined,
                    },
                  },
                  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button":
                    {
                      WebkitAppearance: "none",
                      margin: 0,
                    },
                  "& input[type=number]": {
                    MozAppearance: "textfield",
                  },
                }}
              />
            )}
            <Typography variant="body2" sx={{ fontSize: "0.875rem", color: "text.secondary" }}>
              {displayUnit}
            </Typography>
          </Box>
          {/* Show original value only when there is an UNSAVED local edit */}
          {isLocallyEdited && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                textAlign: "right",
                fontSize: "0.75rem",
                marginTop: "4px",
                paddingRight: "8px",
              }}
            >
              ({formatNumber(originalQuantityValue)})
            </Typography>
          )}
        </TableCell>

        {/* Column 7: EBKP Code */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[6]),
            py: 1,
            px: 1,
          }}
        >
          <Typography sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            fontFamily: "monospace",
            fontSize: "0.875rem",
          }}>
            {element.classification_id || element.ebkph || "-"}
          </Typography>
        </TableCell>

        {/* Column 8: EBKP Name */}
        <TableCell
          sx={{
            ...tableStyles.dataCell,
            ...getColumnStyle(TABLE_COLUMNS[7]),
            py: 1,
            px: 1,
          }}
        >
          <Typography sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}>
            {element.classification_name || (element.classification_id ? getEbkpNameFromCode(element.classification_id) : "-")}
          </Typography>
        </TableCell>
      </TableRow>

      {/* Element details when expanded */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1, paddingLeft: 2 }}>
              {/* Materials Section */}
              <Typography variant="subtitle2" gutterBottom component="div">
                Materialien
              </Typography>
              <MaterialsTable
                element={element}
                uniqueKey={uniqueKey}
                editedElement={editedElement}
              />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
};

export default ElementRow;
