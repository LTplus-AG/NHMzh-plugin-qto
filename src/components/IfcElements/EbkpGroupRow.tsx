import React from "react";
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
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import EditIcon from "@mui/icons-material/Edit";
import { IFCElement } from "../../types/types";
import ElementRow from "./ElementRow";
import { EditedQuantity } from "./types";

interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}

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
}

const EbkpGroupRow: React.FC<EbkpGroupRowProps> = ({
  group,
  isExpanded,
  toggleExpand,
  expandedElements,
  toggleExpandElement,
  editedElements,
  handleQuantityChange,
}) => {
  // Check if any element in the group has been edited
  const hasEditedElements = group.elements.some((el) => editedElements[el.id]);

  return (
    <React.Fragment>
      <TableRow
        sx={{
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
          cursor: "pointer",
          backgroundColor: isExpanded
            ? "rgba(0, 0, 255, 0.04)"
            : hasEditedElements
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
          {hasEditedElements && (
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
        <TableCell>{group.name}</TableCell>
        <TableCell>{group.elements.length}</TableCell>
      </TableRow>

      {/* Expanded EBKP elements */}
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
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
                      <TableCell>Eigenschaften</TableCell>
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
