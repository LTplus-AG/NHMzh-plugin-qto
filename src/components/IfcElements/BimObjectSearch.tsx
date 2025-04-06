import React, { useMemo } from "react";
import {
  Autocomplete,
  TextField,
  Typography,
  Box,
  Chip,
  InputAdornment,
  CircularProgress,
  Paper,
  useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import useBimSearch from "./useBimSearch";
import { IFCElement } from "../../types/types";

interface BimObjectSearchProps {
  elements: IFCElement[];
  onElementSelect: (element: IFCElement | null) => void;
  placeholder?: string;
  width?: number | string;
  viewType?: string;
  ebkpGroups?: any[];
}

const BimObjectSearch: React.FC<BimObjectSearchProps> = ({
  elements,
  onElementSelect,
  placeholder = "Suche nach Namen, Eigenschaften, Ebene, Kategorie...",
  width = 300,
  viewType,
  ebkpGroups,
}) => {
  const theme = useTheme();

  // Use our custom hook for search logic
  const {
    inputValue,
    setInputValue,
    open,
    setOpen,
    loading,
    filteredOptions,
    getNoOptionsText,
  } = useBimSearch(elements, viewType, ebkpGroups);

  // Get option label for display - use name or fallback to type+id
  const getOptionLabel = (option: IFCElement) => {
    if (option.name && option.name !== option.type) {
      return option.name;
    }
    if (option.type_name) {
      return option.type_name;
    }
    return `${option.type || "Element"} ${option.id}`;
  };

  // Format decimal number to display with 3 decimal places
  const formatNumber = (num: number) => {
    return num.toFixed(3);
  };

  // Render option with additional information
  const renderOption = (
    props: React.HTMLAttributes<HTMLLIElement>,
    option: IFCElement
  ) => {
    // Extract key from props to avoid React warnings
    const { key, ...otherProps } = props as any;

    return (
      <li key={key} {...otherProps}>
        <Box sx={{ display: "flex", flexDirection: "column", width: "100%" }}>
          <Typography variant="body1" fontWeight={500}>
            {getOptionLabel(option)}
            {option.groupedElements && option.groupedElements > 1 && (
              <Typography
                component="span"
                variant="caption"
                sx={{
                  ml: 1,
                  color: "text.secondary",
                  backgroundColor: "rgba(25, 118, 210, 0.05)",
                  borderRadius: "4px",
                  padding: "0 4px",
                }}
              >
                {option.groupedElements} Elemente
              </Typography>
            )}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {option.type_name && (
              <Chip
                label={`Type: ${option.type_name}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.type && (
              <Chip
                label={option.type.replace("Ifc", "")}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.level && (
              <Chip
                label={`Ebene: ${option.level}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.category && option.category !== option.type && (
              <Chip
                label={`Kategorie: ${option.category.replace("Ifc", "")}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.is_structural !== undefined && (
              <Chip
                label={option.is_structural ? "Tragend" : "Nicht-tragend"}
                size="small"
                variant="outlined"
                color={option.is_structural ? "primary" : "default"}
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.is_external !== undefined && (
              <Chip
                label={option.is_external ? "Außen" : "Innen"}
                size="small"
                variant="outlined"
                color={option.is_external ? "secondary" : "default"}
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {option.area !== undefined && option.area !== null && (
              <Chip
                label={`Fläche: ${formatNumber(option.area)} m²`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
            {/* Show material name if available */}
            {option.materials && option.materials.length > 0 && (
              <Chip
                label={`Material: ${option.materials[0].name}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            )}
          </Box>
        </Box>
      </li>
    );
  };

  // Custom PaperComponent for better styling
  const CustomPaper = (props: React.ComponentProps<typeof Paper>) => {
    return (
      <Paper
        elevation={6}
        {...props}
        sx={{
          ...props.sx,
          borderRadius: 1,
          mt: 0.5,
          maxHeight: 400,
          "& .MuiAutocomplete-listbox": {
            padding: "4px 0",
          },
        }}
      />
    );
  };

  // Ensure we don't have duplicate IDs in our options to avoid React key warning
  const uniqueFilteredOptions = useMemo(() => {
    const uniqueIds = new Set<string>();
    return filteredOptions.filter((option) => {
      if (uniqueIds.has(option.id)) {
        return false;
      }
      uniqueIds.add(option.id);
      return true;
    });
  }, [filteredOptions]);

  return (
    <Autocomplete
      id="bim-object-search"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={uniqueFilteredOptions}
      getOptionLabel={getOptionLabel}
      getOptionKey={(option) => option.id}
      renderOption={renderOption}
      onChange={(_, newValue) => onElementSelect(newValue)}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      noOptionsText={getNoOptionsText()}
      loading={loading}
      loadingText="Suche..."
      PaperComponent={CustomPaper}
      filterOptions={(options, _) => options}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={placeholder}
          size="small"
          fullWidth
          onFocus={() => {
            // Open dropdown when search field is clicked
            if (!open) setOpen(true);
          }}
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <>
                {loading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 1.5,
              transition: theme.transitions.create(["border-color"]),
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.palette.primary.main,
              },
            },
          }}
        />
      )}
      sx={{ width: width }}
    />
  );
};

export default BimObjectSearch;
