import EditIcon from "@mui/icons-material/Edit";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  Box,
  Chip,
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
import MaterialsTable from "./MaterialsTable";
import { EditedQuantity } from "./types";

// Simple configuration based on TARGET_QUANTITIES from Python
// Maps IFC type to its primary quantity key and unit
const quantityConfig: {
  [key: string]: { key: "area" | "length"; unit: string };
} = {
  IfcWall: { key: "area", unit: "m²" },
  IfcWallStandardCase: { key: "area", unit: "m²" },
  IfcSlab: { key: "area", unit: "m²" },
  IfcCovering: { key: "area", unit: "m²" },
  IfcRoof: { key: "area", unit: "m²" },
  IfcPlate: { key: "area", unit: "m²" },
  IfcCurtainWall: { key: "area", unit: "m²" },
  IfcWindow: { key: "area", unit: "m²" },
  IfcDoor: { key: "area", unit: "m²" },
  IfcBeam: { key: "length", unit: "m" },
  IfcBeamStandardCase: { key: "length", unit: "m" },
  IfcColumn: { key: "length", unit: "m" },
  IfcColumnStandardCase: { key: "length", unit: "m" },
  IfcRailing: { key: "length", unit: "m" },
  IfcReinforcingBar: { key: "length", unit: "m" },
  // Add other types as needed, default to area if not specified
};

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

  // Get the quantity value using our utility function
  const originalQuantity = getQuantityValue(element, primaryQuantityKey);

  // Check if this element has been edited (focusing on the primary quantity)
  const isEdited = editedElement !== undefined;

  // Get the original quantity if it was edited
  const getOriginalQuantityValue = (): number | null | undefined => {
    if (isEdited) {
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
    const valueToFormat = isEdited
      ? editedElement.newQuantity?.value
      : originalQuantity;
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
          backgroundColor: isEdited
            ? "rgba(255, 152, 0, 0.08)"
            : element.groupedElements && element.groupedElements > 1
            ? "rgba(25, 118, 210, 0.05)"
            : "inherit",
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
          {isEdited && (
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
          <Box sx={{ display: "flex", alignItems: "center" }}>
            {element.groupedElements && element.groupedElements > 1 ? (
              <Tooltip
                title="Bearbeitung nicht möglich, da mehrere Elemente gruppiert angezeigt werden. Wechseln Sie zur Einzelansicht um Mengen zu bearbeiten."
                placement="top"
                arrow
              >
                <span style={{ width: "100%" }}>
                  <TextField
                    variant="standard"
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
                      flexGrow: 1, // Take available space
                      mr: 1, // Margin right for spacing
                      "& .MuiInput-root": {
                        "&:before, &:after": {
                          borderBottom: isEdited
                            ? "2px solid orange"
                            : undefined,
                        },
                      },
                      // Style for disabled state
                      "& .Mui-disabled": {
                        WebkitTextFillColor: "rgba(0, 0, 0, 0.6) !important",
                        cursor: "not-allowed",
                      },
                    }}
                  />
                </span>
              </Tooltip>
            ) : (
              <TextField
                variant="standard"
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
                  flexGrow: 1, // Take available space
                  mr: 1, // Margin right for spacing
                  "& .MuiInput-root": {
                    "&:before, &:after": {
                      borderBottom: isEdited ? "2px solid orange" : undefined,
                    },
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
        <TableCell>
          {element.is_structural && (
            <Chip
              label="Tragend"
              size="small"
              color="primary"
              variant="outlined"
              sx={{ mr: 1, mb: 0.5 }}
            />
          )}
          {element.is_external && (
            <Chip
              label="Aussen"
              size="small"
              color="secondary"
              variant="outlined"
              sx={{ mr: 1, mb: 0.5 }}
            />
          )}
          {element.ebkph && (
            <Chip
              label={`EBKPH: ${element.ebkph}`}
              size="small"
              color="default"
              variant="outlined"
              sx={{ mb: 0.5, mr: 1 }}
            />
          )}
        </TableCell>
      </TableRow>

      {/* Element details when expanded */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
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
