import React from "react";
import { Typography, Badge, Tooltip, Chip, Box } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import ClassificationFilter from "./ClassificationFilter";
import BimObjectSearch from "./BimObjectSearch";
import { IFCElement } from "../../types/types";

interface ElementsHeaderProps {
  totalFilteredElements: number;
  targetIfcClasses: string[];
  editedElementsCount: number;
  resetEdits: () => void;
  uniqueClassifications: Array<{
    id: string;
    name: string;
    system: string;
  }>;
  classificationFilter: string;
  setClassificationFilter: (value: string) => void;
  elements?: IFCElement[];
  onElementSelect?: (element: IFCElement | null) => void;
}

const ElementsHeader: React.FC<ElementsHeaderProps> = ({
  totalFilteredElements,
  targetIfcClasses,
  editedElementsCount,
  resetEdits,
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
  elements = [],
  onElementSelect = () => {},
}) => {
  return (
    <div className="flex flex-col mb-3">
      {/* Display edited elements badge if needed */}
      {editedElementsCount > 0 && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Tooltip title="Änderungen zurücksetzen">
            <Chip
              label={`${editedElementsCount} Element${
                editedElementsCount > 1 ? "e" : ""
              } bearbeitet`}
              color="warning"
              onDelete={resetEdits}
            />
          </Tooltip>
        </Box>
      )}

      {/* Search and filter in one row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: 2,
        }}
      >
        {/* Search area */}
        <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
          <BimObjectSearch
            elements={elements}
            onElementSelect={onElementSelect}
            width="100%"
          />
        </Box>

        {/* Classification filter */}
        {uniqueClassifications.length > 0 && (
          <ClassificationFilter
            uniqueClassifications={uniqueClassifications}
            classificationFilter={classificationFilter}
            setClassificationFilter={setClassificationFilter}
          />
        )}
      </Box>
    </div>
  );
};

export default ElementsHeader;
