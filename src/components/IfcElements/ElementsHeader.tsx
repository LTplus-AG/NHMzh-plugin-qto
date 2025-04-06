import React, { useEffect } from "react";
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
  elements?: IFCElement[]; // Use IFCElement type
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
  // Debug log when elements change
  useEffect(() => {
    console.log(`ElementsHeader: received ${elements?.length || 0} elements`);
    if (elements?.length > 0) {
      console.log("First element in ElementsHeader:", elements[0]);

      // Check if level property exists
      const levelsExist = elements.some((elem) => elem.level);
      console.log(`Level property exists in elements: ${levelsExist}`);

      // Extract unique levels for diagnostics
      if (levelsExist) {
        const levels = [
          ...new Set(elements.map((elem) => elem.level).filter(Boolean)),
        ];
        console.log(
          `Available levels (${levels.length}):`,
          levels.slice(0, 10)
        );
      }
    }
  }, [elements]);

  return (
    <div className="flex flex-col mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Typography variant="h5" className="mr-2">
            IFC Elemente ({totalFilteredElements})
          </Typography>
          {targetIfcClasses && targetIfcClasses.length > 0 && (
            <Tooltip
              title={
                <div>
                  <p>Nur folgende IFC-Klassen werden berücksichtigt:</p>
                  <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                    {targetIfcClasses.map((cls: string) => (
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
      </div>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: 2,
        }}
      >
        {/* Add a counter of available elements for search */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BimObjectSearch
            elements={elements}
            onElementSelect={onElementSelect}
            width={400}
          />
          <Chip
            label={`${elements?.length || 0} Elemente`}
            size="small"
            color="default"
            variant="outlined"
          />
        </Box>

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
