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

  // --- Add Debug Logging ---
  if (element.type.toLowerCase().includes("ifcbeam")) {
    console.log(`ElementRow Debug (Beam ID: ${element.id}):`);
    console.log(`  Element Type: ${element.type}`);
    console.log(`  Config Key: ${primaryQuantityKey}`);
    console.log(`  Unit: ${unit}`);
    console.log(
      `  Original Quantity (${primaryQuantityKey}):`,
      element[primaryQuantityKey]
    );
  }
  // --- End Debug Logging ---

  // Get the quantity value from the element data
  const originalQuantity = element[primaryQuantityKey];

  // Check if this element has been edited (focusing on the primary quantity)
  const isEdited = editedElement !== undefined;

  // Get edited and original values based on the quantity key (area or length)
  const editedQuantityValue = isEdited
    ? primaryQuantityKey === "area"
      ? editedElement.newArea
      : editedElement.newLength
    : null;

  const originalQuantityValue = isEdited
    ? primaryQuantityKey === "area"
      ? editedElement.originalArea
      : editedElement.originalLength
    : originalQuantity;

  // Debug original vs edited values
  if (isEdited) {
    console.log(
      `Element ${element.id} (${primaryQuantityKey}) edited: original=${originalQuantityValue}, new=${editedQuantityValue}, current=${originalQuantity}`
    );
  }

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
    const valueToFormat = isEdited ? editedQuantityValue : originalQuantity;
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
          backgroundColor: isEdited ? "rgba(255, 152, 0, 0.08)" : "inherit",
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
          {element.global_id || element.id}
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
            <TextField
              variant="standard"
              size="small"
              type="number"
              inputProps={{
                step: "0.001",
                style: { textAlign: "right" }, // Align text right
              }}
              value={getDisplayValue()} // Display formatted value
              onChange={(e) =>
                handleQuantityChange(
                  element.id,
                  primaryQuantityKey,
                  originalQuantityValue, // Pass the determined original value
                  e.target.value
                )
              }
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
