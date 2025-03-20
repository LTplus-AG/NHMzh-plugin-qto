import React, { useState, useEffect } from "react";
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
  Chip,
  Tooltip,
  Badge,
} from "@mui/material";
import { IFCElement } from "./types";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import InfoIcon from "@mui/icons-material/Info";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
}

const IfcElementsList = ({
  elements,
  loading,
  error,
}: IfcElementsListProps) => {
  const [expandedElements, setExpandedElements] = useState<string[]>([]);

  // Debug logging
  useEffect(() => {
    console.log(`Loaded ${elements.length} IFC elements`);
    console.log("Target IFC classes:", TARGET_IFC_CLASSES);

    // Debug specific element data to check for level information
    if (elements.length > 0) {
      console.log("First element sample:", elements[0]);
      console.log(
        "Level available in elements:",
        elements.some((e) => e.level !== undefined)
      );

      // Check if any elements have level information
      const levelsFound = elements
        .map((e) => e.level)
        .filter((level) => level && level !== "unbekannt");

      console.log("Available levels:", levelsFound);
    }
  }, [elements]);

  const toggleExpand = (id: string) => {
    setExpandedElements((prev) => {
      // If id is already in the array, remove it (collapse)
      if (prev.includes(id)) {
        return prev.filter((elementId) => elementId !== id);
      }
      // Otherwise add it to the array (expand)
      return [...prev, id];
    });
  };

  // If loading, show a loading indicator
  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10"
        style={{ height: "100%" }}
      >
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
      <Alert severity="error" className="mb-4" style={{ height: "100%" }}>
        {error}
      </Alert>
    );
  }

  // If no elements and not loading, return nothing
  if (elements.length === 0) {
    return null;
  }

  // Format decimal number to display with 3 decimal places
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return num.toFixed(3);
  };

  // Function to get materials from either materials array or material_volumes object
  const getElementMaterials = (element: IFCElement) => {
    return element.materials || [];
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="flex items-center mb-3">
        <Typography variant="h5" className="mr-2">
          QTO Elemente ({elements.length})
        </Typography>
        {TARGET_IFC_CLASSES && TARGET_IFC_CLASSES.length > 0 && (
          <Tooltip
            title={
              <div>
                <p>Nur folgende IFC-Klassen werden berücksichtigt:</p>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {TARGET_IFC_CLASSES.map((cls: string) => (
                    <li key={cls}>{cls}</li>
                  ))}
                </ul>
              </div>
            }
            arrow
          >
            <Badge color="info" variant="dot" sx={{ cursor: "pointer" }}>
              <InfoIcon fontSize="small" color="action" />
            </Badge>
          </Tooltip>
        )}
      </div>
      <TableContainer
        component={Paper}
        elevation={2}
        style={{ flexGrow: 1, height: "calc(100% - 40px)", overflow: "auto" }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}>
              <TableCell width="50px" />
              <TableCell>ID</TableCell>
              <TableCell>Kategorie</TableCell>
              <TableCell>Ebene</TableCell>
              <TableCell>Fläche (m²)</TableCell>
              <TableCell>Klassifikation</TableCell>
              <TableCell>Eigenschaften</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {elements.map((element) => {
              const category = element.category || element.type;
              const level = element.level || "unbekannt";
              const id = element.global_id || element.id;

              return (
                <React.Fragment key={id}>
                  <TableRow
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
                        {expandedElements.includes(element.id) ? (
                          <KeyboardArrowUpIcon />
                        ) : (
                          <KeyboardArrowDownIcon />
                        )}
                      </IconButton>
                    </TableCell>
                    <TableCell>{id}</TableCell>
                    <TableCell>{category}</TableCell>
                    <TableCell>{level}</TableCell>
                    <TableCell>
                      {element.area ? formatNumber(element.area) : "-"}
                    </TableCell>
                    <TableCell>
                      {element.classification_id ? (
                        <Tooltip
                          title={
                            <>
                              <div>
                                <strong>ID:</strong> {element.classification_id}
                              </div>
                              {element.classification_name && (
                                <div>
                                  <strong>Name:</strong>{" "}
                                  {element.classification_name}
                                </div>
                              )}
                              {element.classification_system && (
                                <div>
                                  <strong>System:</strong>{" "}
                                  {element.classification_system}
                                </div>
                              )}
                            </>
                          }
                        >
                          <Chip
                            label={element.classification_id}
                            size="small"
                            color="info"
                            sx={{ mr: 1, mb: 0.5 }}
                          />
                        </Tooltip>
                      ) : (
                        "-"
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
                          label="Außen"
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
                          sx={{ mb: 0.5 }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell
                      style={{ paddingBottom: 0, paddingTop: 0 }}
                      colSpan={6}
                    >
                      <Collapse
                        in={expandedElements.includes(element.id)}
                        timeout="auto"
                        unmountOnExit
                      >
                        <Box sx={{ margin: 1 }}>
                          {/* Materials Section */}
                          <Typography variant="h6" gutterBottom component="div">
                            Materialien
                          </Typography>
                          <Table size="small" aria-label="materials">
                            <TableHead>
                              <TableRow>
                                <TableCell>Material</TableCell>
                                <TableCell>Anteil (%)</TableCell>
                                <TableCell>Volumen (m³)</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {getElementMaterials(element).map(
                                (material, index) => (
                                  <TableRow key={`${material.name}-${index}`}>
                                    <TableCell component="th" scope="row">
                                      {material.name}
                                    </TableCell>
                                    <TableCell>
                                      {material.fraction !== undefined
                                        ? `${(material.fraction * 100).toFixed(
                                            1
                                          )}%`
                                        : "-"}
                                    </TableCell>
                                    <TableCell>
                                      {material.volume !== undefined
                                        ? formatNumber(material.volume)
                                        : "-"}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                              {getElementMaterials(element).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={3}>
                                    Keine Materialinformationen verfügbar
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;
