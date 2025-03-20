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
  FormControl,
  Select,
  MenuItem,
  TextField,
} from "@mui/material";
import { IFCElement } from "../types/types";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import InfoIcon from "@mui/icons-material/Info";
import EditIcon from "@mui/icons-material/Edit";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
}

interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}

interface EditedArea {
  originalArea: number | null | undefined;
  newArea: number | null | undefined;
}

const IfcElementsList = ({
  elements,
  loading,
  error,
}: IfcElementsListProps) => {
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [classificationFilter, setClassificationFilter] = useState<string>("");
  const [editedElements, setEditedElements] = useState<
    Record<string, EditedArea>
  >({});

  // Get unique classification IDs
  const uniqueClassifications = React.useMemo(() => {
    const classifications = elements
      .filter(
        (el) =>
          el.classification_id ||
          el.classification_name ||
          el.classification_system
      )
      .map((el) => ({
        id: (el.classification_id as string) || "",
        name: (el.classification_name as string) || "",
        system: el.classification_system || "",
      }));

    // Remove duplicates by combining system and id/name
    const uniqueItems = new Map();
    classifications.forEach((cls) => {
      const key = cls.id
        ? `${cls.system}-${cls.id}`
        : `${cls.system}-${cls.name.substring(0, 20)}`;

      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, cls);
      }
    });

    return Array.from(uniqueItems.values()).sort((a, b) =>
      (a.id || a.name).localeCompare(b.id || b.name)
    );
  }, [elements]);

  // Apply filter and group by EBKP
  const ebkpGroups = React.useMemo(() => {
    // First filter by classification presence - only show elements with BOTH id and name
    const elementsWithValidClassification = elements.filter(
      (el) =>
        el.classification_id &&
        el.classification_name &&
        el.classification_system === "EBKP"
    );

    console.log(
      `Filtered to ${elementsWithValidClassification.length} elements with complete EBKP classification data`
    );

    // Then apply any user-selected filter
    const filteredElements = !classificationFilter
      ? elementsWithValidClassification
      : (() => {
          const [system, identifier] = classificationFilter.split("-");
          return elementsWithValidClassification.filter((el) => {
            if (identifier.includes(" ")) {
              // Filtering by name
              return (
                el.classification_system === system &&
                el.classification_name &&
                el.classification_name.includes(identifier)
              );
            } else {
              // Filtering by ID
              return (
                el.classification_system === system &&
                el.classification_id === identifier
              );
            }
          });
        })();

    // Group by EBKP code
    const groupedElements = new Map<string, EbkpGroup>();

    filteredElements.forEach((element) => {
      if (!element.classification_id) return;

      const ebkpCode = element.classification_id;

      if (!groupedElements.has(ebkpCode)) {
        groupedElements.set(ebkpCode, {
          code: ebkpCode,
          name: element.classification_name || null,
          elements: [],
        });
      }

      groupedElements.get(ebkpCode)?.elements.push(element);
    });

    // Convert to array and sort by EBKP code
    return Array.from(groupedElements.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [elements, classificationFilter]);

  // Debug logging
  useEffect(() => {
    console.log(`Loaded ${elements.length} IFC elements`);
    console.log("Target IFC classes:", TARGET_IFC_CLASSES);
    console.log(`Grouped into ${ebkpGroups.length} EBKP classifications`);

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

      // Debug classification information
      const elementsWithClassification = elements.filter(
        (e) =>
          e.classification_id ||
          e.classification_name ||
          e.classification_system
      );
      console.log(
        `Elements with classification data: ${elementsWithClassification.length}/${elements.length}`
      );

      if (elementsWithClassification.length > 0) {
        console.log("Classification example:", {
          id: elementsWithClassification[0].classification_id,
          name: elementsWithClassification[0].classification_name,
          system: elementsWithClassification[0].classification_system,
        });
      } else {
        console.log("No elements have classification data!");
        // Log first few elements to see their structure
        console.log("Sample elements:", elements.slice(0, 3));
      }
    }
  }, [elements, ebkpGroups]);

  // Debug logging for classification data
  useEffect(() => {
    if (elements.length > 0) {
      // Log elements with and without classification IDs
      const withClassificationId = elements.filter((e) => e.classification_id);
      const withoutClassificationId = elements.filter(
        (e) =>
          e.classification_system &&
          e.classification_name &&
          !e.classification_id
      );
      const withoutClassificationName = elements.filter(
        (e) =>
          e.classification_system &&
          e.classification_id &&
          !e.classification_name
      );
      const withoutBoth = elements.filter(
        (e) =>
          e.classification_system &&
          !e.classification_id &&
          !e.classification_name
      );

      console.log(
        `Elements with classification_id: ${withClassificationId.length}/${elements.length}`
      );
      console.log(
        `Elements with classification_name but no ID: ${withoutClassificationId.length}/${elements.length}`
      );
      console.log(
        `Elements with classification_id but no name: ${withoutClassificationName.length}/${elements.length}`
      );
      console.log(
        `Elements with classification_system but neither ID nor name: ${withoutBoth.length}/${elements.length}`
      );

      // Log sample elements with missing IDs
      if (withoutClassificationId.length > 0) {
        console.log("Sample elements with missing classification IDs:");
        withoutClassificationId.slice(0, 5).forEach((element, index) => {
          console.log(
            `${index + 1}. System: ${element.classification_system}, Name: "${
              element.classification_name || ""
            }", Global ID: ${element.global_id}`
          );
        });
      }

      // Log sample elements with missing names
      if (withoutClassificationName.length > 0) {
        console.log("Sample elements with missing classification names:");
        withoutClassificationName.slice(0, 5).forEach((element, index) => {
          console.log(
            `${index + 1}. System: ${element.classification_system}, ID: "${
              element.classification_id || ""
            }", Global ID: ${element.global_id}`
          );
        });
      }

      // Check for case sensitivity issues in classification IDs
      // This is different from duplicate elements - it's normal to have multiple
      // elements with the same classification ID
      interface DuplicateIssue {
        type: "exact" | "case";
        id: string;
        existing?: string;
        globalId: string;
      }

      const caseInsensitiveIds = new Map<string, string>();
      const duplicateIds: DuplicateIssue[] = [];

      // Group elements by classification ID to check if they're consistent
      const elementsByClassification = new Map<
        string,
        {
          id: string;
          elements: Array<{ globalId: string; name?: string | null }>;
        }
      >();

      withClassificationId.forEach((element) => {
        if (!element.classification_id) return;

        const id = element.classification_id;
        const lowerCaseId = id.toLowerCase();

        // Check for case sensitivity issues
        if (
          caseInsensitiveIds.has(lowerCaseId) &&
          caseInsensitiveIds.get(lowerCaseId) !== id
        ) {
          // Same ID with different case - this is an issue
          duplicateIds.push({
            type: "case",
            id,
            existing: caseInsensitiveIds.get(lowerCaseId),
            globalId: element.global_id,
          });
        } else {
          caseInsensitiveIds.set(lowerCaseId, id);
        }

        // Track elements with the same classification ID
        if (!elementsByClassification.has(id)) {
          elementsByClassification.set(id, {
            id,
            elements: [],
          });
        }

        elementsByClassification.get(id)?.elements.push({
          globalId: element.global_id,
          name: element.classification_name,
        });
      });

      // Log case sensitivity issues
      if (duplicateIds.length > 0) {
        console.log("Found case sensitivity issues in classification IDs:");
        duplicateIds.forEach((item, index) => {
          if (item.type === "case") {
            console.log(
              `${index + 1}. Case sensitivity issue: "${item.id}" vs "${
                item.existing || ""
              }", Global ID: ${item.globalId}`
            );
          }
        });
      } else {
        console.log("No case sensitivity issues found in classification IDs");
      }

      // Log statistics about classifications
      console.log(
        `Found ${elementsByClassification.size} unique classification IDs`
      );

      // Log the most common classifications
      const classificationsWithCounts = Array.from(
        elementsByClassification.values()
      )
        .map((item) => ({
          id: item.id,
          count: item.elements.length,
        }))
        .sort((a, b) => b.count - a.count);

      console.log("Most common classifications:");
      classificationsWithCounts.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${item.id}: ${item.count} elements`);
      });

      // Check common classification codes for C1.3, C4.1, etc to see if they're in names instead of IDs
      const nameCodePattern = /^([A-Z][0-9](\.[0-9])?)\s*,/;
      const namesWithCodes = withoutClassificationId.filter(
        (element) =>
          element.classification_name &&
          nameCodePattern.test(element.classification_name || "")
      );

      if (namesWithCodes.length > 0) {
        console.log(
          `Found ${namesWithCodes.length} elements with codes in the name field instead of ID field:`
        );
        namesWithCodes.slice(0, 5).forEach((element, index) => {
          const match = element.classification_name?.match(nameCodePattern);
          const extractedCode = match ? match[1] : "unknown";
          console.log(
            `${index + 1}. Code in name: "${extractedCode}" from "${
              element.classification_name || ""
            }", Global ID: ${element.global_id}`
          );
        });
      }
    }
  }, [elements]);

  // Handle area edit
  const handleAreaChange = (
    elementId: string,
    originalArea: number | null | undefined,
    newValue: string
  ) => {
    const newArea = newValue === "" ? null : parseFloat(newValue);

    setEditedElements((prev) => {
      // If the new value is the same as original, remove from edited elements
      if (newArea === originalArea) {
        const newEdited = { ...prev };
        delete newEdited[elementId];
        return newEdited;
      }

      // Otherwise update with new value
      return {
        ...prev,
        [elementId]: {
          originalArea,
          newArea,
        },
      };
    });
  };

  // Reset all edits
  const resetEdits = () => {
    setEditedElements({});
  };

  // Get count of edited elements
  const editedElementsCount = Object.keys(editedElements).length;

  const toggleExpandEbkp = (code: string) => {
    setExpandedEbkp((prev) => {
      // If code is already in the array, remove it (collapse)
      if (prev.includes(code)) {
        return prev.filter((ebkpCode) => ebkpCode !== code);
      }
      // Otherwise add it to the array (expand)
      return [...prev, code];
    });
  };

  const toggleExpandElement = (id: string) => {
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

  // Count total elements in all EBKP groups
  const totalFilteredElements = ebkpGroups.reduce(
    (sum, group) => sum + group.elements.length,
    0
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center mb-3"
        style={{ justifyContent: "space-between" }}
      >
        <div className="flex items-center">
          <Typography variant="h5" className="mr-2">
            QTO Elemente ({totalFilteredElements})
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

        <div className="flex items-center" style={{ gap: "16px" }}>
          {editedElementsCount > 0 && (
            <Tooltip title="Änderungen zurücksetzen">
              <Chip
                label={`${editedElementsCount} Element${
                  editedElementsCount > 1 ? "e" : ""
                } bearbeitet`}
                color="warning"
                onDelete={resetEdits}
              />
            </Tooltip>
          )}

          {uniqueClassifications.length > 0 && (
            <div className="flex items-center">
              <Typography variant="body2" className="mr-2">
                Filter nach Klassifikation:
              </Typography>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <Select
                  value={classificationFilter}
                  onChange={(e) => setClassificationFilter(e.target.value)}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>Alle anzeigen</em>
                  </MenuItem>
                  {uniqueClassifications.map((cls, index) => {
                    const displayValue = cls.id
                      ? `${cls.system} ${cls.id} - ${
                          cls.name?.substring(0, 30) || ""
                        }`
                      : `${cls.system} ${cls.name?.substring(0, 40) || ""}`;
                    const filterValue = cls.id
                      ? `${cls.system}-${cls.id}`
                      : `${cls.system}-${cls.name}`;
                    return (
                      <MenuItem
                        key={`cls-${index}-${filterValue}`}
                        value={filterValue}
                      >
                        {displayValue}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            </div>
          )}
        </div>
      </div>
      <TableContainer
        component={Paper}
        elevation={2}
        style={{
          flexGrow: 1,
          height: "calc(100% - 40px)",
          maxHeight: "calc(100vh - 180px)",
          overflow: "auto",
          paddingTop: "12px",
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}>
              <TableCell width="50px" />
              <TableCell>EBKP</TableCell>
              <TableCell>Bezeichnung</TableCell>
              <TableCell>Anzahl Elemente</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ebkpGroups.map((group) => {
              const isExpanded = expandedEbkp.includes(group.code);
              // Check if group has any edited elements
              const hasEditedElements = group.elements.some(
                (el) => editedElements[el.id]
              );

              return (
                <React.Fragment key={`ebkp-${group.code}`}>
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
                    onClick={() => toggleExpandEbkp(group.code)}
                  >
                    <TableCell>
                      <IconButton
                        aria-label="expand row"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandEbkp(group.code);
                        }}
                      >
                        {isExpanded ? (
                          <KeyboardArrowUpIcon />
                        ) : (
                          <KeyboardArrowDownIcon />
                        )}
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
                    <TableCell
                      style={{ paddingBottom: 0, paddingTop: 0 }}
                      colSpan={4}
                    >
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                          <Typography variant="h6" gutterBottom component="div">
                            Elemente ({group.elements.length})
                          </Typography>
                          <TableContainer
                            sx={{
                              maxHeight: "50vh",
                              overflow: "auto",
                              border: "1px solid rgba(224, 224, 224, 1)",
                              borderRadius: 1,
                            }}
                          >
                            <Table size="small" stickyHeader>
                              <TableHead>
                                <TableRow
                                  sx={{
                                    backgroundColor: "rgba(0, 0, 0, 0.05)",
                                  }}
                                >
                                  <TableCell width="50px" />
                                  <TableCell>ID</TableCell>
                                  <TableCell>Kategorie</TableCell>
                                  <TableCell>Ebene</TableCell>
                                  <TableCell>Fläche (m²)</TableCell>
                                  <TableCell>Eigenschaften</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {group.elements.map((element, elementIndex) => {
                                  const isElementExpanded =
                                    expandedElements.includes(element.id);
                                  const category =
                                    element.category || element.type;
                                  const level = element.level || "unbekannt";
                                  const uniqueKey = `${
                                    group.code
                                  }-${elementIndex}-${element.id.substring(
                                    0,
                                    8
                                  )}`;

                                  // Check if this element has been edited
                                  const isEdited =
                                    editedElements[element.id] !== undefined;
                                  const editedArea = isEdited
                                    ? editedElements[element.id].newArea
                                    : null;

                                  return (
                                    <React.Fragment key={uniqueKey}>
                                      <TableRow
                                        sx={{
                                          "&:hover": {
                                            backgroundColor:
                                              "rgba(0, 0, 0, 0.02)",
                                          },
                                          cursor: "pointer",
                                          backgroundColor: isEdited
                                            ? "rgba(255, 152, 0, 0.08)"
                                            : "inherit",
                                        }}
                                        onClick={() =>
                                          toggleExpandElement(element.id)
                                        }
                                      >
                                        <TableCell>
                                          <IconButton
                                            aria-label="expand element"
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleExpandElement(element.id);
                                            }}
                                          >
                                            {isElementExpanded ? (
                                              <KeyboardArrowUpIcon />
                                            ) : (
                                              <KeyboardArrowDownIcon />
                                            )}
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
                                              backgroundColor:
                                                "rgba(255, 152, 0, 0.15)",
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
                                                : element.area === null ||
                                                  element.area === undefined
                                                ? ""
                                                : element.area
                                            }
                                            onChange={(e) =>
                                              handleAreaChange(
                                                element.id,
                                                element.area,
                                                e.target.value
                                              )
                                            }
                                            sx={{
                                              width: "100%",
                                              "& .MuiInput-root": {
                                                "&:before, &:after": {
                                                  borderBottom: isEdited
                                                    ? "2px solid orange"
                                                    : undefined,
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
                                              (Original:{" "}
                                              {formatNumber(
                                                editedElements[element.id]
                                                  .originalArea
                                              )}
                                              )
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
                                              sx={{ mb: 0.5, mr: 1 }}
                                            />
                                          )}
                                        </TableCell>
                                      </TableRow>

                                      {/* Element details when expanded */}
                                      <TableRow>
                                        <TableCell
                                          style={{
                                            paddingBottom: 0,
                                            paddingTop: 0,
                                          }}
                                          colSpan={6}
                                        >
                                          <Collapse
                                            in={isElementExpanded}
                                            timeout="auto"
                                            unmountOnExit
                                          >
                                            <Box
                                              sx={{ margin: 1, paddingLeft: 2 }}
                                            >
                                              {/* Materials Section */}
                                              <Typography
                                                variant="subtitle2"
                                                gutterBottom
                                                component="div"
                                              >
                                                Materialien
                                              </Typography>
                                              <Table
                                                size="small"
                                                aria-label="materials"
                                              >
                                                <TableHead>
                                                  <TableRow>
                                                    <TableCell>
                                                      Material
                                                    </TableCell>
                                                    <TableCell>
                                                      Anteil (%)
                                                    </TableCell>
                                                    <TableCell>
                                                      Volumen (m³)
                                                    </TableCell>
                                                  </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                  {getElementMaterials(
                                                    element
                                                  ).map(
                                                    (
                                                      material,
                                                      materialIndex
                                                    ) => (
                                                      <TableRow
                                                        key={`material-${uniqueKey}-${materialIndex}`}
                                                      >
                                                        <TableCell
                                                          component="th"
                                                          scope="row"
                                                        >
                                                          {material.name}
                                                        </TableCell>
                                                        <TableCell>
                                                          {material.fraction !==
                                                          undefined
                                                            ? `${(
                                                                material.fraction *
                                                                100
                                                              ).toFixed(1)}%`
                                                            : "-"}
                                                        </TableCell>
                                                        <TableCell>
                                                          {material.volume !==
                                                          undefined
                                                            ? formatNumber(
                                                                material.volume
                                                              )
                                                            : "-"}
                                                        </TableCell>
                                                      </TableRow>
                                                    )
                                                  )}
                                                  {getElementMaterials(element)
                                                    .length === 0 && (
                                                    <TableRow>
                                                      <TableCell colSpan={3}>
                                                        Keine
                                                        Materialinformationen
                                                        verfügbar
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
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}

            {ebkpGroups.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  Keine Elemente mit EBKP-Klassifikation gefunden
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

export default IfcElementsList;
