import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  Grid,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormHelperText,
  SelectChangeEvent, // Import SelectChangeEvent
  Alert,
  Autocomplete, // <<< Import Autocomplete
  InputAdornment, // <<< Import InputAdornment
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import { ManualElementInput } from "../../types/manualTypes";
import { ebkpData, EbkpDataItem } from "../../data/ebkpData.ts"; // <<< Corrected Import path and attempt to import type
import apiClient from "../../api/ApiClient"; // <<< Import apiClient
import { IFCElement as LocalIFCElement } from "../../types/types"; // <<< Import LocalIFCElement

// Helper type for classification options in dropdown
interface ClassificationOption {
  key: string; // e.g., "EBKP-H-C1.1"
  display: string; // e.g., "C1.1 - EBKP - Kanalisation Gebäude"
  system: string;
  id: string | null;
  name: string | null;
}

interface ManualElementFormProps {
  onSubmit: (data: ManualElementInput, editingId: string | null) => void;
  onCancel: () => void;
  isLoading?: boolean;
  initialData?: LocalIFCElement | null;
  availableLevels: string[];
  availableMaterialNames: string[];
}

// <<< Updated QUANTITY_TYPES with German labels >>>
const QUANTITY_TYPES = [
  { type: "area", unit: "m²", label: "Fläche" },
  { type: "length", unit: "m", label: "Länge" },
  // { type: "volume", unit: "m³" }, // Removed
  // { type: "count", unit: "pcs" }, // Removed
];

const ManualElementForm: React.FC<ManualElementFormProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
  initialData = null,
  availableLevels,
  availableMaterialNames,
}) => {
  const [formData, setFormData] = useState<ManualElementInput>(() => {
    const defaults: ManualElementInput = {
      name: "",
      type: "",
      level: null,
      quantity: { value: null, type: "area", unit: "m²" },
      classification: null,
      materials: [],
      description: null,
    };
    if (initialData) {
      return {
        name: initialData.name || "",
        type: initialData.type || "",
        level: initialData.level || null,
        quantity: {
          value:
            initialData.quantity?.value ??
            initialData.area ??
            initialData.length ??
            null,
          type:
            initialData.quantity?.type ||
            (initialData.length ? "length" : "area"),
          unit: initialData.quantity?.unit || (initialData.length ? "m" : "m²"),
        },
        classification: initialData.classification || null,
        materials: (initialData.materials || []).map((m) => ({
          name: m.name || "",
          fraction: m.fraction ?? 0,
        })),
        description: initialData.description || null,
      } as ManualElementInput;
    }
    return defaults;
  });

  const [selectedClassKey, setSelectedClassKey] = useState<string>(() => {
    if (initialData?.classification) {
      const initSys = initialData.classification.system;
      const initId = initialData.classification.id;
      if (initSys && initId) return `${initSys}-${initId}`;
      const initName = initialData.classification.name;
      if (initSys && initName) return `${initSys}-${initName}`;
    }
    return "";
  });

  const [materialFractionError, setMaterialFractionError] =
    useState<string>("");

  // <<< ADDED: State for IFC classes >>>
  const [targetIfcClasses, setTargetIfcClasses] = useState<string[]>([]);
  const [ifcClassesLoading, setIfcClassesLoading] = useState<boolean>(true);
  const [ifcClassesError, setIfcClassesError] = useState<string | null>(null);

  // <<< ADDED: State for disabling quantity type select >>>
  const [isQuantityTypeDisabled, setIsQuantityTypeDisabled] =
    useState<boolean>(false);

  // <<< ADDED: Fetch IFC classes on mount >>>
  useEffect(() => {
    const fetchClasses = async () => {
      setIfcClassesLoading(true);
      setIfcClassesError(null);
      try {
        const classes = await apiClient.getTargetIfcClasses();
        setTargetIfcClasses(classes.sort()); // Sort alphabetically
      } catch (err) {
        console.error("Failed to fetch IFC classes", err);
        setIfcClassesError("Fehler beim Laden der IFC-Klassen.");
      } finally {
        setIfcClassesLoading(false);
      }
    };
    fetchClasses();
  }, []); // Empty dependency array means run once on mount

  // <<< ADDED: useEffect to handle Element Type changes >>>
  useEffect(() => {
    const selectedType = formData.type;

    if (!selectedType) {
      // No type selected yet
      setIsQuantityTypeDisabled(true); // Disable until a type is chosen
      // Optionally reset to a default like area?
      // setFormData((prev) => ({ ...prev, quantity: { ...prev.quantity, type: 'area', unit: 'm²' } }));
      return;
    }

    if (selectedType === "ManualQuantity") {
      // Generic type selected, ENABLE the dropdown
      setIsQuantityTypeDisabled(false);
      // Default to area if current type is invalid
      if (
        formData.quantity.type !== "area" &&
        formData.quantity.type !== "length"
      ) {
        setFormData((prev) => ({
          ...prev,
          quantity: { ...prev.quantity, type: "area", unit: "m²" },
        }));
      }
    } else {
      // A specific IFC Class is selected, DISABLE the dropdown and determine type
      setIsQuantityTypeDisabled(true);
      let determinedKey: "area" | "length" = "area"; // Default to area
      let determinedUnit = "m²";

      // Check if it's a beam or column type
      if (selectedType.includes("Beam") || selectedType.includes("Column")) {
        determinedKey = "length";
        determinedUnit = "m";
      }
      // No need to check quantityConfig here, logic is simplified

      // Update state only if it needs changing
      if (
        formData.quantity.type !== determinedKey ||
        formData.quantity.unit !== determinedUnit
      ) {
        setFormData((prev) => ({
          ...prev,
          quantity: {
            ...prev.quantity,
            type: determinedKey,
            unit: determinedUnit,
          },
        }));
      }
    }
  }, [formData.type]); // Dependency on selected element type

  useEffect(() => {
    // Validate material fractions whenever they change
    if (formData.materials.length > 0) {
      const totalFraction = formData.materials.reduce(
        (sum, mat) => sum + (mat.fraction || 0),
        0
      );
      // Use a small tolerance for floating-point comparison
      if (Math.abs(totalFraction - 1.0) > 1e-6) {
        setMaterialFractionError(
          `Materialanteile müssen 100% ergeben (Aktuell: ${(
            totalFraction * 100
          ).toFixed(1)}%)`
        );
      } else {
        setMaterialFractionError("");
      }
    } else {
      setMaterialFractionError(""); // No error if no materials
    }
  }, [formData.materials]);

  // <<< UPDATED: handleInputChange to allow Select changes >>>
  const handleInputChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | SelectChangeEvent<string>
  ) => {
    // Check if event target has name and value (for TextField/Select)
    if (
      e.target &&
      typeof e.target === "object" &&
      "name" in e.target &&
      "value" in e.target
    ) {
      const { name, value } = e.target as { name: string; value: unknown };
      setFormData((prev) => ({
        ...prev,
        [name]: value === "" ? null : (value as string | null),
      }));
    }
  };

  const handleQuantityValueChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { value } = e.target;
    // Parse to number, or set null if empty/invalid
    const numericValue = value === "" ? null : parseFloat(value);

    setFormData((prev) => ({
      ...prev,
      quantity: {
        ...prev.quantity,
        // Store null if invalid, otherwise the parsed number
        value:
          numericValue !== null && !isNaN(numericValue) ? numericValue : null,
      },
    }));
  };

  const handleQuantityTypeChange = (e: SelectChangeEvent<string>) => {
    const selectedType = e.target.value;
    const selectedConfig = QUANTITY_TYPES.find(
      (qt) => qt.type === selectedType
    );
    if (selectedConfig) {
      setFormData((prev) => ({
        ...prev,
        quantity: {
          ...prev.quantity,
          type: selectedConfig.type,
          unit: selectedConfig.unit,
        },
      }));
    }
  };

  // <<< UPDATED: Handle Classification Dropdown Change >>>
  const handleClassificationSelectChange = (e: SelectChangeEvent<string>) => {
    const selectedKey = e.target.value;
    setSelectedClassKey(selectedKey); // Update the key state

    // Find the full classification object based on the selected key from STATIC data
    const selectedOption = classificationOptions.find(
      (opt) => opt.key === selectedKey
    );

    // Update formData with the structured classification data
    setFormData((prev) => ({
      ...prev,
      classification: selectedOption
        ? {
            // Reconstruct the classification object for formData
            id: selectedOption.id,
            name: selectedOption.name,
            system: selectedOption.system,
          }
        : null, // Set to null if 'None' or invalid key is selected
    }));
  };

  const handleMaterialChange = (
    index: number,
    event: React.ChangeEvent<HTMLInputElement> | React.SyntheticEvent,
    fieldName: "name" | "fraction",
    newValue?: string | null
  ) => {
    const updatedMaterials = [...formData.materials];
    let currentMaterial = { ...updatedMaterials[index] };

    if (fieldName === "name") {
      currentMaterial.name = newValue || "";
    } else if (fieldName === "fraction") {
      const { value } = event.target as HTMLInputElement;
      const displayValue = value;

      if (
        currentMaterial.fraction === 0 &&
        displayValue.startsWith("0") &&
        displayValue.length > 1 &&
        displayValue[1] !== "."
      ) {
        const validValue = displayValue.substring(1);
        const numericValue = parseFloat(validValue);
        currentMaterial.fraction = isNaN(numericValue)
          ? 0
          : Math.min(100, Math.max(0, numericValue)) / 100;
      } else {
        const numericValue = displayValue === "" ? 0 : parseFloat(displayValue);
        if (!isNaN(numericValue)) {
          currentMaterial.fraction =
            Math.min(100, Math.max(0, numericValue)) / 100;
        }
      }
    }

    updatedMaterials[index] = currentMaterial;
    setFormData((prev) => ({ ...prev, materials: updatedMaterials }));
  };

  const addMaterial = () => {
    setFormData((prev) => {
      const newMaterials = [...prev.materials, { name: "", fraction: 0 }];
      const numMaterials = newMaterials.length;
      const equalFraction = numMaterials > 0 ? 1.0 / numMaterials : 0;

      // Update fractions for all materials
      const updatedMaterialsWithFractions = newMaterials.map((mat) => ({
        ...mat,
        fraction: equalFraction,
      }));

      return {
        ...prev,
        materials: updatedMaterialsWithFractions,
      };
    });
  };

  const removeMaterial = (index: number) => {
    setFormData((prev) => {
      const updatedMaterials = prev.materials.filter((_, i) => i !== index);
      const numMaterials = updatedMaterials.length;
      const equalFraction = numMaterials > 0 ? 1.0 / numMaterials : 0;

      // Update fractions for remaining materials
      const updatedMaterialsWithFractions = updatedMaterials.map((mat) => ({
        ...mat,
        fraction: equalFraction,
      }));

      return {
        ...prev,
        materials: updatedMaterialsWithFractions,
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialFractionError) {
      // Ensure quantity value is a number before submitting
      const finalQuantityValue =
        typeof formData.quantity.value === "number"
          ? formData.quantity.value
          : null;
      // Explicitly check for null BEFORE isNaN
      if (finalQuantityValue === null || isNaN(finalQuantityValue)) {
        console.error("Invalid quantity value on submit");
        // Optionally show a user error
        return;
      }

      // Ensure the classification object in formData is up-to-date before submitting
      // (It should be due to handleClassificationSelectChange, but double-check)
      const finalClassificationData = formData.classification;

      onSubmit(
        {
          ...formData,
          quantity: { ...formData.quantity, value: finalQuantityValue },
          classification: finalClassificationData,
        },
        initialData?.id || null
      );
    }
  };

  // Validate final form data for submission enabling
  const isFormValid =
    formData.name &&
    formData.type &&
    typeof formData.quantity.value === "number" &&
    formData.quantity.value > 0 &&
    !materialFractionError &&
    selectedClassKey; // <<< ADDED: Ensure a classification key is selected

  // <<< UPDATED: Prepare options from static ebkpData >>>
  const classificationOptions = useMemo((): ClassificationOption[] => {
    return ebkpData
      .map((item: EbkpDataItem) => {
        // <<< Added type for item
        const key = `EBKP-H-${item.code}`; // Consistent key format
        const display = `${item.code} - ${item.name}`; // Simple display
        return {
          key,
          display,
          system: "EBKP-H", // System is always EBKP-H
          id: item.code, // Use code as id
          name: item.name, // Use name from data
        };
      })
      .sort((a: ClassificationOption, b: ClassificationOption) =>
        a.display.localeCompare(b.display)
      ); // <<< Added types for a, b
  }, []); // No dependency needed as ebkpData is static

  // <<< ADDED: Handler for Autocomplete (Level) changes >>>
  const handleLevelChange = (
    event: React.SyntheticEvent,
    newValue: string | null // newValue can be string entered or null
  ) => {
    setFormData((prev) => ({
      ...prev,
      level: newValue, // Directly set the selected or typed value
    }));
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {initialData
          ? "Manuelles Element Bearbeiten"
          : "Manuelles Element hinzufügen"}
      </Typography>
      {/* Display error if IFC classes failed to load */}
      {ifcClassesError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {ifcClassesError}
        </Alert>
      )}
      <Grid container spacing={2}>
        {/* Basic Info */}
        <Grid item xs={12} sm={7}>
          <TextField
            required
            fullWidth
            label="Element Name"
            name="name"
            value={formData.name || ""}
            onChange={handleInputChange}
            size="small"
            error={!formData.name}
            helperText={!formData.name ? "Name ist erforderlich" : ""}
          />
        </Grid>
        <Grid item xs={12} sm={5}>
          {/* Element Type Select */}
          <FormControl fullWidth size="small" required error={!formData.type}>
            <InputLabel id="element-type-select-label">Element Typ</InputLabel>
            <Select
              labelId="element-type-select-label"
              name="type"
              value={formData.type || ""}
              label="Element Typ"
              onChange={handleInputChange}
              disabled={ifcClassesLoading}
            >
              {ifcClassesLoading && (
                <MenuItem value="" disabled>
                  Laden...
                </MenuItem>
              )}
              {!ifcClassesLoading && targetIfcClasses.length === 0 && (
                <MenuItem value="" disabled>
                  Keine Klassen verfügbar
                </MenuItem>
              )}
              <MenuItem value="ManualQuantity">
                Manuelle Menge (Generisch)
              </MenuItem>
              {targetIfcClasses.map((ifcClass) => (
                <MenuItem key={ifcClass} value={ifcClass}>
                  {ifcClass}
                </MenuItem>
              ))}
            </Select>
            {!formData.type && (
              <FormHelperText>Typ ist erforderlich</FormHelperText>
            )}
          </FormControl>
        </Grid>

        {/* Row 2: Quantity, Type, Level */}
        {/* Menge Input with Adornment */}
        <Grid item xs={6} sm={4}>
          <TextField
            required
            fullWidth
            label="Menge"
            name="value"
            type="number"
            inputProps={{ step: "any", sx: { textAlign: "right" } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  {formData.quantity.unit || "-"}
                </InputAdornment>
              ),
            }}
            value={formData.quantity.value ?? ""}
            onChange={handleQuantityValueChange}
            size="small"
            error={
              formData.quantity.value === null || formData.quantity.value <= 0
            }
            helperText={
              formData.quantity.value === null || formData.quantity.value <= 0
                ? "Menge muss > 0 sein"
                : ""
            }
          />
        </Grid>
        {/* Mengentyp Select */}
        <Grid item xs={6} sm={4}>
          <FormControl fullWidth size="small" required>
            <InputLabel>Mengentyp</InputLabel>
            <Select
              name="type"
              value={formData.quantity.type}
              label="Mengentyp"
              onChange={handleQuantityTypeChange}
              disabled={isQuantityTypeDisabled}
            >
              {QUANTITY_TYPES.map((qt) => (
                <MenuItem key={qt.type} value={qt.type}>
                  {qt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {/* Level Autocomplete */}
        <Grid item xs={12} sm={4}>
          <Autocomplete
            freeSolo
            options={availableLevels}
            value={formData.level || ""}
            onChange={handleLevelChange}
            onInputChange={(event, newInputValue) => {
              setFormData((prev) => ({
                ...prev,
                level: newInputValue || null,
              }));
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Ebene / Geschoss"
                name="level"
                size="small"
                fullWidth
              />
            )}
          />
        </Grid>

        {/* Classification */}
        <Grid item xs={12}>
          <Typography variant="subtitle1">Klassifizierung (EBKP-H)</Typography>
        </Grid>
        <Grid item xs={12}>
          {" "}
          {/* Make dropdown full width */}
          <FormControl
            fullWidth
            size="small"
            required
            error={!selectedClassKey}
          >
            <InputLabel id="ebkp-classification-select-label">
              EBKP-H Klassifikation
            </InputLabel>
            <Select
              labelId="ebkp-classification-select-label"
              value={selectedClassKey}
              label="EBKP-H Klassifikation"
              onChange={handleClassificationSelectChange}
              displayEmpty
            >
              <MenuItem value="">
                {" "}
                {/* Option for no selection - REMOVE explicit text */}
              </MenuItem>
              {classificationOptions.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.display}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* Materials */}
        <Grid item xs={12}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="subtitle1">Materialien</Typography>
            <Button
              startIcon={<AddCircleOutlineIcon />}
              onClick={addMaterial}
              size="small"
            >
              Material hinzufügen
            </Button>
          </Box>
          {materialFractionError && (
            <FormHelperText error sx={{ mt: 1 }}>
              {materialFractionError}
            </FormHelperText>
          )}
        </Grid>
        {formData.materials.map((material, index) => (
          <React.Fragment key={index}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={availableMaterialNames}
                value={material.name || ""}
                onChange={(event, newValue) => {
                  handleMaterialChange(index, event, "name", newValue);
                }}
                onInputChange={(event, newInputValue) => {
                  handleMaterialChange(
                    index,
                    event as React.SyntheticEvent,
                    "name",
                    newInputValue
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label={`Material Name ${index + 1}`}
                    name="name"
                    size="small"
                    fullWidth
                    error={!material.name}
                    helperText={!material.name ? "Name ist erforderlich" : ""}
                  />
                )}
              />
            </Grid>
            <Grid item xs={10} sm={4}>
              <TextField
                required
                fullWidth
                label={`Anteil (%) ${index + 1}`}
                name="fraction"
                type="text"
                inputProps={{ inputMode: "decimal" }}
                value={
                  material.fraction !== undefined
                    ? (material.fraction * 100).toString()
                    : ""
                }
                onChange={(e) => handleMaterialChange(index, e, "fraction")}
                size="small"
                error={materialFractionError ? true : false}
              />
            </Grid>
            <Grid
              item
              xs={2}
              sm={2}
              sx={{ display: "flex", alignItems: "center" }}
            >
              <IconButton
                onClick={() => removeMaterial(index)}
                color="error"
                size="small"
              >
                <RemoveCircleOutlineIcon />
              </IconButton>
            </Grid>
          </React.Fragment>
        ))}
        {formData.materials.length === 0 && (
          <Grid item xs={12}>
            <Typography variant="caption" color="textSecondary">
              Keine Materialien hinzugefügt. Bei nur einem Material wird der
              Anteil automatisch auf 100% gesetzt.
            </Typography>
          </Grid>
        )}
      </Grid>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
        <Button onClick={onCancel} sx={{ mr: 1 }} disabled={isLoading}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={isLoading || !isFormValid}
        >
          {isLoading
            ? "Speichern..."
            : initialData
            ? "Änderungen speichern"
            : "Manuelles Element speichern"}
        </Button>
      </Box>
    </Box>
  );
};

export default ManualElementForm;
