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
  Box,
} from "@mui/material";
import { useEffect, useState } from "react";
import { IFCElement } from "../types/types";
import EbkpGroupRow from "./IfcElements/EbkpGroupRow";
import ElementsHeader from "./IfcElements/ElementsHeader";
import { useEbkpGroups } from "./IfcElements/hooks/useEbkpGroups";
import { EditedQuantity } from "./IfcElements/types";
import ViewModeToggle from "./IfcElements/ViewModeToggle";

// Get target IFC classes from environment variable
const TARGET_IFC_CLASSES = import.meta.env.VITE_TARGET_IFC_CLASSES
  ? import.meta.env.VITE_TARGET_IFC_CLASSES.split(",")
  : [];

interface IfcElementsListProps {
  elements: IFCElement[];
  loading: boolean;
  error: string | null;
  editedElements: Record<string, EditedQuantity>;
  editedElementsCount: number;
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length",
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  resetEdits: () => void;
  onEbkpStatusChange: (hasGroups: boolean) => void;
  targetIfcClasses?: string[];
  viewType?: string;
  setViewType?: (viewType: string) => void;
}

const IfcElementsList = ({
  elements,
  loading,
  error,
  editedElements,
  editedElementsCount,
  handleQuantityChange,
  resetEdits,
  onEbkpStatusChange,
  targetIfcClasses = TARGET_IFC_CLASSES,
  viewType,
  setViewType,
}: IfcElementsListProps) => {
  const [expandedEbkp, setExpandedEbkp] = useState<string[]>([]);
  const [expandedElements, setExpandedElements] = useState<string[]>([]);
  const [classificationFilter, setClassificationFilter] = useState<string[]>(
    []
  );
  const [_selectedElement, setSelectedElement] = useState<IFCElement | null>(
    null
  );

  // Use only the EBKP groups hook, not the element editing hook
  const { ebkpGroups, uniqueClassifications, hasEbkpGroups } = useEbkpGroups(
    elements,
    classificationFilter,
    viewType
  );

  // Call the callback when hasEbkpGroups changes
  useEffect(() => {
    onEbkpStatusChange(hasEbkpGroups);
  }, [hasEbkpGroups, onEbkpStatusChange]);

  // Handle element selection from search
  const handleElementSelect = (element: IFCElement | null) => {
    setSelectedElement(element);

    if (element) {
      // Find the EBKP code for the selected element
      const ebkpGroup = ebkpGroups.find((group) =>
        group.elements.some((e) => e.id === element.id)
      );

      if (ebkpGroup) {
        // Expand the EBKP group if not already expanded
        if (!expandedEbkp.includes(ebkpGroup.code)) {
          setExpandedEbkp((prev) => [...prev, ebkpGroup.code]);
        }

        // Expand the element if not already expanded
        if (!expandedElements.includes(element.id)) {
          setExpandedElements((prev) => [...prev, element.id]);
        }

        // Scroll to the element
        setTimeout(() => {
          const elementRow = document.getElementById(
            `element-row-${element.id}`
          );
          if (elementRow) {
            elementRow.scrollIntoView({ behavior: "smooth", block: "center" });
            // Highlight the element briefly
            elementRow.style.backgroundColor = "rgba(25, 118, 210, 0.1)";
            setTimeout(() => {
              elementRow.style.backgroundColor = "";
            }, 2000);
          }
        }, 100);
      }
    }
  };

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
        style={{ height: "100%", width: "100%" }}
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
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ElementsHeader
        totalFilteredElements={totalFilteredElements}
        targetIfcClasses={targetIfcClasses}
        editedElementsCount={editedElementsCount}
        resetEdits={resetEdits}
        uniqueClassifications={uniqueClassifications}
        classificationFilter={classificationFilter}
        setClassificationFilter={setClassificationFilter}
        elements={elements}
        onElementSelect={handleElementSelect}
        viewType={viewType}
        ebkpGroups={ebkpGroups}
      />

      <TableContainer
        component={Paper}
        elevation={2}
        style={{
          width: "100%",
          flexGrow: 1,
          overflow: "auto",
          paddingTop: "12px",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 2,
            py: 1,
            borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          <Typography variant="subtitle1" fontWeight="medium">
            Elemente ({totalFilteredElements})
          </Typography>

          {setViewType && (
            <ViewModeToggle
              viewType={viewType || "individual"}
              onChange={setViewType}
            />
          )}
        </Box>

        <Table stickyHeader style={{ width: "100%", tableLayout: "fixed" }}>
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
                handleQuantityChange={handleQuantityChange}
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

export const ElementDetailHeader = () => (
  <TableHead>
    <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.04)" }}>
      <TableCell width="50px" />
      <TableCell>Type</TableCell>
      <TableCell>Kategorie</TableCell>
      <TableCell>Geschoss</TableCell>
      <TableCell width="150px" align="center">
        Menge
      </TableCell>
      <TableCell>Eigenschaften</TableCell>
    </TableRow>
  </TableHead>
);
