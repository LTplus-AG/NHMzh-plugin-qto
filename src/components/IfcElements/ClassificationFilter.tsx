import React from "react";
import { Typography, FormControl, Select, MenuItem, Box } from "@mui/material";

interface ClassificationFilterProps {
  uniqueClassifications: Array<{
    id: string;
    name: string;
    system: string;
  }>;
  classificationFilter: string;
  setClassificationFilter: (value: string) => void;
}

const ClassificationFilter: React.FC<ClassificationFilterProps> = ({
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
}) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
      <Typography
        variant="body2"
        sx={{ mr: 1, fontSize: "0.875rem", color: "text.secondary" }}
      >
        Filter nach Klassifikation:
      </Typography>
      <FormControl size="small" sx={{ minWidth: 220 }}>
        <Select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value as string)}
          displayEmpty
        >
          <MenuItem value="">
            <em>Alle anzeigen</em>
          </MenuItem>
          {uniqueClassifications.map((cls, index) => {
            const displayValue = cls.id
              ? `${cls.system} ${cls.id} - ${cls.name?.substring(0, 30) || ""}`
              : `${cls.system} ${cls.name?.substring(0, 40) || ""}`;
            const filterValue = cls.id
              ? `${cls.system}-${cls.id}`
              : `${cls.system}-${cls.name}`;
            return (
              <MenuItem key={`cls-${index}-${filterValue}`} value={filterValue}>
                {displayValue}
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>
    </Box>
  );
};

export default ClassificationFilter;
