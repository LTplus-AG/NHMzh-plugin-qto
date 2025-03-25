import {
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { IFCElement } from "../types/types";
import EbkpGroupRow from "./IfcElements/EbkpGroupRow";
import ElementsHeader from "./IfcElements/ElementsHeader";
import { useEbkpGroups } from "./IfcElements/hooks/useEbkpGroups";
import { EditedArea } from "./IfcElements/types";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
  editedElements: Record<string, EditedArea>;
  editedElementsCount: number;
  handleAreaChange: (
    elementId: string,
    originalArea: number | null | undefined,
    newValue: string
  ) => void;
  resetEdits: () => void;
}

const IfcElementsList = ({
  elements,
  loading,
  error,
  editedElements,
  editedElementsCount,
  handleAreaChange,
  resetEdits,
}: IfcElementsListProps) => {
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [classificationFilter, setClassificationFilter] = useState<string>("");

  // Use only the EBKP groups hook, not the element editing hook
  const { ebkpGroups, uniqueClassifications } = useEbkpGroups(
    elements,
    classificationFilter
  );

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
    }
  }, [elements, ebkpGroups]);

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
      <ElementsHeader
        totalFilteredElements={totalFilteredElements}
        targetIfcClasses={TARGET_IFC_CLASSES}
        editedElementsCount={editedElementsCount}
        resetEdits={resetEdits}
        uniqueClassifications={uniqueClassifications}
        classificationFilter={classificationFilter}
        setClassificationFilter={setClassificationFilter}
      />

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
            {ebkpGroups.map((group) => (
              <EbkpGroupRow
                key={`ebkp-${group.code}`}
                group={group}
                isExpanded={expandedEbkp.includes(group.code)}
                toggleExpand={toggleExpandEbkp}
                expandedElements={expandedElements}
                toggleExpandElement={toggleExpandElement}
                editedElements={editedElements}
                handleAreaChange={handleAreaChange}
              />
            ))}

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
