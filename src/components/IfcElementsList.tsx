import {
  Typography,
  Paper,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Alert,
  Collapse,
  IconButton,
  Box,
} from "@mui/material";
import { IFCElement } from "./types";
import { useState } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
}

const IfcElementsList = ({ elements, loading, error }: IfcElementsListProps) => {
  const [expandedElement, setExpandedElement] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedElement(expandedElement === id ? null : id);
  };

  // If loading, show a loading indicator
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
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
      <Alert severity="error" className="mb-4">
        {error}
      </Alert>
    );
  }

  // If no elements and not loading, return nothing
  if (elements.length === 0) {
    return null;
  }

  return (
    <div>
      <Typography variant="h5" className="mt-4 mb-3">
        IFC-Elemente ({elements.length})
      </Typography>
      <TableContainer component={Paper} elevation={2}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}>
              <TableCell width="50px" />
              <TableCell>GlobalId</TableCell>
              <TableCell>Typ</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Beschreibung</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {elements.map((element) => (
              <>
                <TableRow
                  key={element.id}
                  sx={{
                    "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpand(element.id)}
                >
                  <TableCell>
                    <IconButton
                      aria-label="expand row"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(element.id);
                      }}
                    >
                      {expandedElement === element.id ? (
                        <KeyboardArrowUpIcon />
                      ) : (
                        <KeyboardArrowDownIcon />
                      )}
                    </IconButton>
                  </TableCell>
                  <TableCell>{element.global_id}</TableCell>
                  <TableCell>{element.type}</TableCell>
                  <TableCell>{element.name || "-"}</TableCell>
                  <TableCell>{element.description || "-"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell
                    style={{ paddingBottom: 0, paddingTop: 0 }}
                    colSpan={5}
                  >
                    <Collapse
                      in={expandedElement === element.id}
                      timeout="auto"
                      unmountOnExit
                    >
                      <Box sx={{ margin: 1 }}>
                        <Typography variant="h6" gutterBottom component="div">
                          Eigenschaften
                        </Typography>
                        <Table size="small" aria-label="properties">
                          <TableHead>
                            <TableRow>
                              <TableCell>Eigenschaft</TableCell>
                              <TableCell>Wert</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {element.properties &&
                              Object.entries(element.properties).map(
                                ([key, value]) => (
                                  <TableRow key={key}>
                                    <TableCell component="th" scope="row">
                                      {key}
                                    </TableCell>
                                    <TableCell>{value}</TableCell>
                                  </TableRow>
                                )
                              )}
                            {(!element.properties ||
                              Object.keys(element.properties).length === 0) && (
                              <TableRow>
                                <TableCell colSpan={2}>
                                  Keine Eigenschaften verfügbar
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;
