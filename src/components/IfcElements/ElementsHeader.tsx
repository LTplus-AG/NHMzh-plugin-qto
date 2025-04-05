import React from "react";
import {
  Typography,
  Badge,
  Tooltip,
  Chip,
  FormControl,
  Select,
  MenuItem,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";

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
}

const ElementsHeader: React.FC<ElementsHeaderProps> = ({
  totalFilteredElements,
  targetIfcClasses,
  editedElementsCount,
  resetEdits,
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
}) => {
  return (
    <div
      className="flex items-center mb-3"
      style={{ justifyContent: "space-between" }}
    >
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
                onChange={(e) =>
                  setClassificationFilter(e.target.value as string)
                }
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
  );
};

export default ElementsHeader;
