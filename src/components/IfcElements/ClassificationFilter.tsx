import React from "react";
import {
  Typography,
  FormControl,
  Select,
  MenuItem,
  Box,
  OutlinedInput,
  Chip,
  SelectChangeEvent,
} from "@mui/material";

interface ClassificationFilterProps {
  uniqueClassifications: Array<{
    id: string;
    name: string;
    system: string;
  }>;
  classificationFilter: string[];
  setClassificationFilter: (value: string[]) => void;
}

const ClassificationFilter: React.FC<ClassificationFilterProps> = ({
  uniqueClassifications,
  classificationFilter,
  setClassificationFilter,
}) => {
  const handleChange = (event: SelectChangeEvent<string[]>) => {
    const {
      target: { value },
    } = event;

    if (Array.isArray(value) && value.includes("--clear-all--")) {
      setClassificationFilter([]);
    } else {
      setClassificationFilter(
        Array.isArray(value)
          ? value
          : typeof value === "string"
          ? value.split(",")
          : []
      );
    }
  };

  const getDisplayFromValue = (value: string) => {
    const cls = uniqueClassifications.find((c) => {
      const filterVal = c.id ? `${c.system}-${c.id}` : `${c.system}-${c.name}`;
      return filterVal === value;
    });
    if (cls) {
      return cls.id
        ? `${cls.system} ${cls.id}`
        : cls.name?.substring(0, 20) || cls.system;
    }
    return value;
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
      <Typography
        variant="body2"
        sx={{ mr: 1, fontSize: "0.875rem", color: "text.secondary" }}
      >
        Filter nach Klassifikation:
      </Typography>
      <FormControl size="small" sx={{ minWidth: 250, maxWidth: 400 }}>
        <Select
          multiple
          value={classificationFilter}
          onChange={handleChange}
          input={<OutlinedInput size="small" />}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 1.5,
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: (theme) => theme.palette.primary.main,
              },
            },
          }}
          renderValue={(selected) => {
            return (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {selected.map((value) => (
                  <Chip
                    key={value}
                    label={getDisplayFromValue(value)}
                    size="small"
                    onDelete={() =>
                      setClassificationFilter(
                        classificationFilter.filter((item) => item !== value)
                      )
                    }
                    onMouseDown={(event: React.MouseEvent) => {
                      event.stopPropagation();
                    }}
                  />
                ))}
              </Box>
            );
          }}
          displayEmpty
          MenuProps={{
            PaperProps: {
              elevation: 6,
              style: {
                maxHeight: 300,
                borderRadius: 8,
                marginTop: "4px",
              },
            },
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left",
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left",
            },
          }}
        >
          <MenuItem
            value="--clear-all--"
            disabled={classificationFilter.length === 0}
            sx={{ fontStyle: "italic", color: "text.secondary" }}
          >
            Auswahl löschen
          </MenuItem>
          {uniqueClassifications.map((cls, index) => {
            const displayValue = cls.id
              ? `${cls.system} ${cls.id} - ${cls.name?.substring(0, 40) || ""}`
              : `${cls.system} ${cls.name?.substring(0, 50) || ""}`;
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
