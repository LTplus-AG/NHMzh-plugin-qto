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
  Divider,
} from "@mui/material";
import { IFCElement } from "./types";
import { useState, useEffect } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

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
  const [expandedElement, setExpandedElement] = useState<string | null>(null);

  // Debug logging
  useEffect(() => {
    console.log("Elements data:", elements);
    // Log any elements with Material.Layers property
    const elementsWithLayers = elements.filter(
      (el) => el.properties && el.properties["Material.Layers"]
    );
    if (elementsWithLayers.length > 0) {
      console.log(
        "Found elements with Material.Layers:",
        elementsWithLayers.length
      );
      console.log("First element with layers:", elementsWithLayers[0]);
    }

    // Log any elements with material_volumes
    const elementsWithVolumes = elements.filter(
      (el) => el.material_volumes && Object.keys(el.material_volumes).length > 0
    );
    if (elementsWithVolumes.length > 0) {
      console.log(
        "Found elements with material_volumes:",
        elementsWithVolumes.length
      );
      console.log("First element with volumes:", elementsWithVolumes[0]);
    } else {
      console.log("No elements with material_volumes found");
    }
  }, [elements]);

  const toggleExpand = (id: string) => {
    console.log("Expanded element:", id);
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

  // Format decimal number to display with 3 decimal places
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return num.toFixed(3);
  };

  // Function to process elements and filter out material properties if we have material_volumes
  const processElementProperties = (element: IFCElement) => {
    // If no material_volumes, just return the original properties
    if (
      !element.material_volumes ||
      Object.keys(element.material_volumes).length === 0
    ) {
      return element.properties;
    }

    console.log("Filtering properties for element:", element.global_id);
    console.log("Before filtering:", element.properties);

    // Otherwise, filter out Material.Layers property
    const filteredProperties: Record<string, string> = {};
    for (const [key, value] of Object.entries(element.properties)) {
      if (key !== "Material.Layers") {
        filteredProperties[key] = value;
      }
    }

    console.log("After filtering:", filteredProperties);
    return filteredProperties;
  };

  // Function to check if the element has material widths
  const hasMaterialWidths = (element: IFCElement) => {
    if (!element.material_volumes) return false;
    return Object.values(element.material_volumes).some(
      (mat) => mat.width !== undefined && mat.width > 0
    );
  };

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
            {elements.map((element) => {
              // Debug log when rendering each element
              if (expandedElement === element.id) {
                console.log("Rendering expanded element:", element);
                console.log(
                  "Has material_volumes:",
                  element.material_volumes
                    ? Object.keys(element.material_volumes).length
                    : "none"
                );
              }

              return (
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
                          {/* Material Volumes Section - Show this first if available */}
                          {element.material_volumes &&
                            Object.keys(element.material_volumes).length >
                              0 && (
                              <>
                                <Typography
                                  variant="h6"
                                  gutterBottom
                                  component="div"
                                >
                                  Materialien und Volumen
                                </Typography>
                                <Table
                                  size="small"
                                  aria-label="material-volumes"
                                >
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Material</TableCell>
                                      <TableCell>Anteil (%)</TableCell>
                                      <TableCell>Volumen (m³)</TableCell>
                                      {hasMaterialWidths(element) && (
                                        <TableCell>Dicke (mm)</TableCell>
                                      )}
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {Object.entries(
                                      element.material_volumes
                                    ).map(([materialName, info]) => (
                                      <TableRow key={materialName}>
                                        <TableCell component="th" scope="row">
                                          {materialName}
                                        </TableCell>
                                        <TableCell>
                                          {info.fraction !== undefined
                                            ? `${(info.fraction * 100).toFixed(
                                                1
                                              )}%`
                                            : "-"}
                                        </TableCell>
                                        <TableCell>
                                          {info.volume !== undefined
                                            ? formatNumber(info.volume)
                                            : "-"}
                                        </TableCell>
                                        {hasMaterialWidths(element) && (
                                          <TableCell>
                                            {info.width !== undefined &&
                                            info.width > 0
                                              ? formatNumber(info.width)
                                              : "-"}
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                                <Divider sx={{ my: 2 }} />
                              </>
                            )}

                          {/* Add debug info about material_volumes */}
                          {expandedElement === element.id && (
                            <div
                              style={{
                                background: "#f5f5f5",
                                padding: 8,
                                marginBottom: 16,
                                fontSize: 12,
                              }}
                            >
                              <div>
                                DEBUG: Has material_volumes:{" "}
                                {element.material_volumes ? "Yes" : "No"}
                              </div>
                              {element.material_volumes && (
                                <div>
                                  Volume count:{" "}
                                  {Object.keys(element.material_volumes).length}
                                </div>
                              )}
                              {element.properties &&
                                element.properties["Material.Layers"] && (
                                  <div>
                                    <div>
                                      Has Material.Layers in properties: Yes
                                    </div>
                                    <div>
                                      Value:{" "}
                                      {element.properties["Material.Layers"]}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}

                          {/* Volume Information */}
                          {element.volume && (
                            <>
                              <Typography
                                variant="h6"
                                gutterBottom
                                component="div"
                              >
                                Volumen
                              </Typography>
                              <Table size="small" aria-label="volume">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Typ</TableCell>
                                    <TableCell>Wert (m³)</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {element.volume.net !== null && (
                                    <TableRow>
                                      <TableCell>Netto Volumen</TableCell>
                                      <TableCell>
                                        {formatNumber(element.volume.net)}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                  {element.volume.gross !== null && (
                                    <TableRow>
                                      <TableCell>Brutto Volumen</TableCell>
                                      <TableCell>
                                        {formatNumber(element.volume.gross)}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                              <Divider sx={{ my: 2 }} />
                            </>
                          )}

                          {/* Properties Section */}
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
                              {processElementProperties(element) &&
                                Object.entries(
                                  processElementProperties(element)
                                ).map(([key, value]) => (
                                  <TableRow key={key}>
                                    <TableCell component="th" scope="row">
                                      {key}
                                    </TableCell>
                                    <TableCell>{value}</TableCell>
                                  </TableRow>
                                ))}
                              {(!element.properties ||
                                Object.keys(element.properties).length ===
                                  0) && (
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
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;
