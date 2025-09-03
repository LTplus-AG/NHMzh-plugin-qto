import { Box } from "@mui/material";
import React from "react";
import { IFCElement } from "../../types/types";
import BimObjectSearch from "./BimObjectSearch";
import ClassificationFilter from "./ClassificationFilter";
import { EbkpGroup } from "./types";

interface ElementsHeaderProps {
  totalFilteredElements: number;
  targetIfcClasses: string[];
  uniqueClassifications: Array<{
    id: string;
    name: string;
    system: string;
  }>;
  classificationFilter: string[];
  setClassificationFilter: (value: string[]) => void;
  elements?: IFCElement[];
  onElementSelect?: (element: IFCElement | null) => void;
  viewType?: string;
  ebkpGroups?: EbkpGroup[];
}

const ElementsHeader: React.FC<ElementsHeaderProps> = ({
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
  elements = [],
  onElementSelect = () => { },
  viewType,
  ebkpGroups,
}) => {
  return (
    <div className="flex flex-col mb-3">
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
            viewType={viewType}
            ebkpGroups={ebkpGroups}
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
