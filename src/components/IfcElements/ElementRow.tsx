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
import { EditedArea } from "./types";

interface ElementRowProps {
  element: IFCElement;
  groupCode: string;
  elementIndex: number;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  editedElement?: EditedArea;
  handleAreaChange: (
    elementId: string,
    originalArea: number | null | undefined,
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
  handleAreaChange,
}) => {
  const category = element.category || element.type;
  const level = element.level || "unbekannt";
  const uniqueKey = `${groupCode}-${elementIndex}-${element.id.substring(
    0,
    8
  )}`;

  // Check if this element has been edited
  const isEdited = editedElement !== undefined;
  const editedArea = isEdited ? editedElement.newArea : null;

  // Debug original vs edited area values
  if (isEdited) {
    console.log(
      `Element ${element.id} edited: original=${editedElement.originalArea}, new=${editedElement.newArea}, current=${element.area}`
    );
  }

  // Format decimal number to display with 3 decimal places
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return num.toFixed(3);
  };

  return (
    <React.Fragment>
      <TableRow
        sx={{
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.02)" },
          cursor: "pointer",
          backgroundColor: isEdited ? "rgba(255, 152, 0, 0.08)" : "inherit",
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
        <TableCell
          sx={{
            position: "relative",
            ...(isEdited && {
              backgroundColor: "rgba(255, 152, 0, 0.15)",
              borderRadius: 1,
            }),
          }}
        >
          <TextField
            variant="standard"
            size="small"
            type="number"
            inputProps={{
              step: "0.001",
              style: { textAlign: "center" },
            }}
            value={
              isEdited
                ? editedArea === null
                  ? ""
                  : editedArea
                : element.area === null || element.area === undefined
                ? ""
                : element.area
            }
            onChange={(e) =>
              handleAreaChange(element.id, element.area, e.target.value)
            }
            onClick={(e) => e.stopPropagation()}
            sx={{
              width: "100%",
              "& .MuiInput-root": {
                "&:before, &:after": {
                  borderBottom: isEdited ? "2px solid orange" : undefined,
                },
              },
            }}
          />
          {isEdited && (
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                textAlign: "center",
                fontSize: "0.7rem",
              }}
            >
              (Original: {formatNumber(editedElement.originalArea)})
            </Typography>
          )}
        </TableCell>
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
