import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Box,
  Collapse,
  IconButton,
  TableCell,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import React from "react";
import { IFCElement } from "../../types/types";
import MaterialsTable from "./ElementTable";
import { EditedQuantity } from "./types";
import { ElementDisplayStatus, STATUS_CONFIG } from "../IfcElementsList";
import { quantityConfig } from "../../types/types";

interface ElementRowProps {
  element: IFCElement;
  groupCode: string;
  elementIndex: number;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  editedElement?: EditedQuantity; // Updated to use EditedQuantity type
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length", // Identify which quantity is changing
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  getElementDisplayStatus: (element: IFCElement) => ElementDisplayStatus; // Add prop type
  isParentGroupExpanded: boolean; // <<< ADD parent expansion state prop
}

const getQuantityValue = (
  element: any,
  quantityType: "area" | "length"
): number | null | undefined => {
  // First try the new schema: element.quantity.value
  if (
    element.quantity &&
    typeof element.quantity === "object" &&
    element.quantity.type === quantityType
  ) {
    return element.quantity.value;
  }

  // Fallback to the old schema: element.area or element.length
  if (quantityType === "area" && element.area !== undefined) {
    return element.area;
  }
  if (quantityType === "length" && element.length !== undefined) {
    return element.length;
  }

  return undefined; // Or 0, depending on desired behavior
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
  isParentGroupExpanded, // <<< DESTRUCTURE parent expansion state prop
}) => {
  const category = element.category || element.type;
  const level = element.level || "unbekannt";
  const uniqueKey = `${groupCode}-${elementIndex}-${element.id.substring(
    0,
    8
  )}`;

  // Determine the primary quantity key and unit based on IFC type
  const config = quantityConfig[element.type] || { key: "area", unit: "m²" }; // Default to area
  const primaryQuantityKey = config.key;
  const unit = config.unit;

  // Determine display status
  const displayStatus = getElementDisplayStatus(element);
  const statusConfig = STATUS_CONFIG[displayStatus];

  // Check if this element has been edited (focusing on the primary quantity)
  const isEdited = displayStatus === "edited"; // Use displayStatus for consistency

  // Get the original quantity if it was edited
  const getOriginalQuantityValue = (): number | null | undefined => {
    if (isEdited && editedElement) {
      // Try new schema first
      if (
        editedElement.originalQuantity &&
        typeof editedElement.originalQuantity === "object"
      ) {
        return editedElement.originalQuantity.value;
      }
      // Fallback to old schema fields
      return primaryQuantityKey === "area"
        ? editedElement.originalArea
        : editedElement.originalLength;
    }

    // Get from non-edited element (new schema)
    if (
      element.original_quantity &&
      typeof element.original_quantity === "object"
    ) {
      return element.original_quantity.value;
    }

    // Fallback for non-edited (old schema)
    // Note: original_area was the only field for this in the old schema
    return element.original_area;
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
        primaryQuantityKey === "area" &&
        editedElement.newArea !== undefined &&
        editedElement.newArea !== null
      ) {
        valueFromEditState = editedElement.newArea;
      } else if (
        primaryQuantityKey === "length" &&
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
    }

    // If no transient edit state, show the value from the main element prop
    const valueToFormat = getQuantityValue(element, primaryQuantityKey); // Use helper
    if (valueToFormat === null || valueToFormat === undefined) return "";
    return formatNumber(valueToFormat);
  };

  return (
    <React.Fragment>
      <TableRow
        id={`element-row-${element.id}`}
        sx={{
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.02)" },
          cursor: "pointer",
          backgroundColor: isExpanded
            ? "rgba(0, 0, 255, 0.04)" // Expanded background
            : displayStatus === "edited"
            ? "rgba(144, 202, 249, 0.1)" // Lighter blue for edited
            : displayStatus === "pending"
            ? "rgba(255, 204, 128, 0.1)" // Lighter orange for pending
            : "inherit", // Default
          transition: "background-color 0.3s ease",
        }}
        onClick={() => toggleExpand(element.id)}
      >
        <TableCell>
          <IconButton
            aria-label="expand element"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(element.id);
            }}
          >
            {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          {element.type_name || element.name || element.type}
          {displayStatus === "edited" && (
            <EditIcon
              fontSize="small"
              sx={{
                ml: 1,
                verticalAlign: "middle",
                color: "warning.main",
              }}
            />
          )}
          {element.groupedElements && element.groupedElements > 1 && (
            <Typography
              variant="caption"
              sx={{
                ml: 1,
                display: "inline-block",
                color: "text.secondary",
                backgroundColor: element.hasPropertyDifferences
                  ? "rgba(255, 152, 0, 0.08)"
                  : "rgba(25, 118, 210, 0.05)",
                borderRadius: "4px",
                padding: "0 4px",
                fontWeight: "medium",
              }}
            >
              {element.groupedElements} Elemente
              {element.hasPropertyDifferences && (
                <span
                  style={{
                    marginLeft: "4px",
                    color: "orange",
                  }}
                  title="Diese Elemente haben unterschiedliche Eigenschaften"
                >
                  *
                </span>
              )}
            </Typography>
          )}
        </TableCell>
        <TableCell>{category}</TableCell>
        <TableCell>{level}</TableCell>
        {/* Quantity Cell */}
        <TableCell
          sx={{
            position: "relative",
            ...(isEdited && {
              backgroundColor: "rgba(255, 152, 0, 0.15)",
              borderRadius: 1,
            }),
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
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
                    value={getDisplayValue()} // Display formatted value
                    disabled={true}
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      width: "calc(100% - 40px)", // Adjust width, leave space for unit
                      mr: 1,
                      "& .MuiInput-root": {
                        borderRadius: 1, // Match outlined style
                      },
                      // Style for disabled state
                      "& .Mui-disabled": {
                        WebkitTextFillColor: "rgba(0, 0, 0, 0.6) !important",
                        cursor: "not-allowed",
                        backgroundColor: "rgba(0, 0, 0, 0.02)", // Slight background for disabled
                      },
                      // Hide number input spinners
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
                type="number"
                inputProps={{
                  step: "0.001",
                  style: { textAlign: "right" }, // Align text right
                }}
                value={getDisplayValue()} // Display formatted value
                onChange={(e) => {
                  // If this is a grouped element, don't allow direct editing
                  if (element.groupedElements && element.groupedElements > 1) {
                    return;
                  }

                  handleQuantityChange(
                    element.id,
                    primaryQuantityKey,
                    originalQuantityValue, // Pass the determined original value
                    e.target.value
                  );
                }}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  width: "calc(100% - 40px)", // Adjust width, leave space for unit
                  mr: 1,
                  "& .MuiInput-root": {
                    borderRadius: 1,
                    borderColor: isEdited ? "warning.main" : undefined, // Highlight border if edited
                    "&.Mui-focused fieldset": {
                      borderColor: isEdited ? "warning.main" : undefined, // Keep border color on focus if edited
                    },
                  },
                  // Hide number input spinners
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
            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
              {unit}
            </Typography>
          </Box>
          {isEdited && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                textAlign: "right", // Align original value text right
                fontSize: "0.7rem",
              }}
            >
              (Original: {formatNumber(originalQuantityValue)} {unit})
            </Typography>
          )}
        </TableCell>
        {/* End Quantity Cell */}
        {/* Status Cell - Add the colored dot */}
        <TableCell align="center">
          {!isParentGroupExpanded && (
            <Tooltip title={statusConfig.label}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  bgcolor: statusConfig.color,
                  display: "inline-block",
                }}
              />
            </Tooltip>
          )}
        </TableCell>
      </TableRow>

      {/* Element details when expanded */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1, paddingLeft: 2 }}>
              {/* Materials Section */}
              <Typography variant="subtitle2" gutterBottom component="div">
                Materialien
              </Typography>
              <MaterialsTable element={element} uniqueKey={uniqueKey} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
};

export default ElementRow;
