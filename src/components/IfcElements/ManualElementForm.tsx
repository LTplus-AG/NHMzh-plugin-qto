import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import PercentIcon from "@mui/icons-material/Percent";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import StarIcon from "@mui/icons-material/Star";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import {
  Autocomplete,
  Box,
  Button,
  Collapse,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import React, { useEffect, useMemo, useState } from "react";
import apiClient from "../../api/ApiClient";
import { ebkpData, EbkpDataItem } from "../../data/ebkpData.ts";
import {
  ManualClassificationInput,
  ManualElementInput,
} from "../../types/manualTypes";
import { IFCElement as LocalIFCElement } from "../../types/types";

// Interface for material state within the form
interface FormMaterialState {
  name: string;
  fraction: number;
  volume?: number | null; // Store volume temporarily or permanently
}

// Helper type for classification options
interface ClassificationOption {
  key: string;
  display: string;
  system: string;
  id: string | null;
  name: string | null;
  isPriority?: boolean;
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
];

// <<< NEW: Mapping from IFC Class to prioritized eBKP-H codes >>>
const ifcClassToEbkpPriority: { [ifcClass: string]: string[] } = {
  IfcWall: ["C2.1", "C2.2", "E1.1", "G1.1"],
  IfcWallStandardCase: ["C2.1", "C2.2", "E1.1", "G1.1"],
  IfcSlab: ["C2.4", "C1.1", "G2.1", "G2.2"],
  IfcBeam: ["C2.4", "C2.3"],
  IfcBeamStandardCase: ["C2.4", "C2.3"],
  IfcColumn: ["C2.3"],
  IfcColumnStandardCase: ["C2.3"],
  IfcWindow: ["E1.3"],
  IfcDoor: ["E1.3", "G1.2"],
  IfcRoof: ["C3.1", "F1.1", "C3.2"],
  IfcCovering: ["G2.2", "G3.2", "F1.1"],
  IfcFooting: ["C1.2"],
  // Add more mappings as needed
};
// <<< END NEW MAPPING >>>

// Type for the form data state, aligning with ManualElementInput but using FormMaterialState
type FormDataState = Omit<ManualElementInput, "materials" | "totalVolume"> & {
  materials: FormMaterialState[];
  // totalVolume is handled by separate state
};

// --- Styled Components for Mode Toggle ---
const ModeToggleContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 20,
  padding: 2,
  width: "fit-content",
}));

const ModeToggleButton = styled(Box, {
  // Forward active and NOW disabled props
  shouldForwardProp: (prop) => prop !== "active" && prop !== "disabled",
})<{ active: boolean; disabled?: boolean }>(({ theme, active, disabled }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 16,
  padding: "4px 8px",
  cursor: disabled ? "not-allowed" : "pointer", // Change cursor if disabled
  transition: "all 0.2s",
  backgroundColor: active ? theme.palette.action.selected : "transparent",
  color: active
    ? theme.palette.action.active
    : disabled
    ? theme.palette.action.disabled
    : theme.palette.text.secondary, // Disabled color
  opacity: disabled ? 0.5 : 1, // Reduced opacity if disabled
  pointerEvents: disabled ? "none" : "auto", // Prevent clicks if disabled
  "&:hover": {
    backgroundColor: disabled
      ? "transparent" // No hover effect if disabled
      : active
      ? theme.palette.action.selected
      : theme.palette.action.hover,
  },
}));
// --- END Styled Components ---

const ManualElementForm: React.FC<ManualElementFormProps> = ({
  onSubmit,
  onCancel,
  isLoading = false,
  initialData = null,
  availableLevels,
  availableMaterialNames,
}) => {
  // --- State Initialization ---
  const [formData, setFormData] = useState<FormDataState>(() => {
    const defaults: FormDataState = {
      name: "",
      type: "",
      level: null,
      quantity: { value: null, type: "area", unit: "m²" },
      classification: null,
      materials: [],
      description: null,
    };
    if (initialData) {
      const initialMaterials: FormMaterialState[] = (
        initialData.materials || []
      ).map((m) => ({
        name: m.name || "",
        fraction: m.fraction ?? 0,
        volume: m.volume ?? null,
      }));
      // Ensure classification structure matches ManualClassificationInput | null
      const initialClassification: ManualClassificationInput | null =
        initialData.classification
          ? {
              id: initialData.classification.id ?? null,
              name: initialData.classification.name ?? null,
              system: initialData.classification.system ?? null,
            }
          : null;
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
        classification: initialClassification, // Use validated structure
        materials: initialMaterials,
        description: initialData.description || null,
      };
    }
    return defaults;
  });

  // Separate state for total volume, try to initialize from initialData materials sum
  const [totalVolume, setTotalVolume] = useState<number | null>(() => {
    if (initialData?.materials && initialData.materials.length > 0) {
      const sum = initialData.materials.reduce(
        (acc, m) => acc + (m.volume ?? 0),
        0
      );
      return sum > 0 ? sum : null;
    }
    return null;
  });

  const [selectedClassKey, setSelectedClassKey] = useState<string>(() => {
    if (initialData?.classification) {
      const initSys = initialData.classification.system;
      const initId = initialData.classification.id;
      if (initSys && initId) return `EBKP-H-${initId}`;
      // Fallback if only name/system (shouldn't happen with static data but safe)
      const initName = initialData.classification.name;
      if (initSys && initName) return `${initSys}-${initName}`;
    }
    return "";
  });
  const [materialFractionError, setMaterialFractionError] =
    useState<string>("");
  const [materialVolumeError, setMaterialVolumeError] = useState<string>("");
  const [targetIfcClasses, setTargetIfcClasses] = useState<string[]>([]);
  const [ifcClassesLoading, setIfcClassesLoading] = useState<boolean>(true);
  const [isQuantityTypeDisabled, setIsQuantityTypeDisabled] =
    useState<boolean>(false);
  const [step, setStep] = useState<number>(initialData ? 3 : 1);
  const [materialInputMode, setMaterialInputMode] = useState<
    "percentage" | "volume"
  >("percentage");
  const [initialVolumeInput, setInitialVolumeInput] = useState<string>("");
  const [initialVolumeError, setInitialVolumeError] = useState<string>("");

  // --- Effects ---
  useEffect(() => {
    const fetchClasses = async () => {
      setIfcClassesLoading(true);
      try {
        const classes = await apiClient.getTargetIfcClasses();
        setTargetIfcClasses(classes.sort());
      } catch (err) {
        console.error("Failed to fetch IFC classes", err);
      } finally {
        setIfcClassesLoading(false);
      }
    };
    fetchClasses();
  }, []);

  useEffect(() => {
    const selectedType = formData.type;
    if (!selectedType) {
      setIsQuantityTypeDisabled(true);
      return;
    }
    if (selectedType === "ManualQuantity") {
      setIsQuantityTypeDisabled(false);
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
      setIsQuantityTypeDisabled(true);
      let determinedKey: "area" | "length" = "area";
      let determinedUnit = "m²";
      if (selectedType.includes("Beam") || selectedType.includes("Column")) {
        determinedKey = "length";
        determinedUnit = "m";
      }
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
  }, [formData.type]);

  useEffect(() => {
    if (formData.materials.length === 0) {
      setMaterialFractionError("");
      setMaterialVolumeError("");
      return;
    }

    if (materialInputMode === "percentage") {
      setMaterialVolumeError("");
      const totalFraction = formData.materials.reduce(
        (sum, mat) => sum + (mat.fraction || 0),
        0
      );
      setMaterialFractionError(
        Math.abs(totalFraction - 1.0) > 1e-6
          ? `Anteile müssen 100% ergeben (Aktuell: ${(
              totalFraction * 100
            ).toFixed(1)}%)`
          : ""
      );
    } else {
      setMaterialFractionError("");
      if (typeof totalVolume !== "number" || totalVolume <= 0) {
        setMaterialVolumeError(
          "Gesamtvolumen muss > 0 sein, um Materialvolumen zu prüfen."
        );
        return;
      }
      const currentTotalMaterialVolume = formData.materials.reduce(
        (sum, mat) => sum + (mat.volume || 0),
        0
      );
      setMaterialVolumeError(
        Math.abs(currentTotalMaterialVolume - totalVolume) > 1e-5
          ? `Materialvolumen (${currentTotalMaterialVolume.toFixed(
              3
            )} m³) muss Gesamtvolumen (${totalVolume} m³) entsprechen.`
          : ""
      );
    }
  }, [formData.materials, totalVolume, materialInputMode]);

  // --- Input Handlers ---
  const handleInputChange = (
    e:
      | React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      | SelectChangeEvent<string>
  ) => {
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
  const handleTotalVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const numericValue = value === "" ? null : parseFloat(value);
    const validVolume =
      numericValue !== null && !isNaN(numericValue) && numericValue >= 0
        ? numericValue
        : null;
    setTotalVolume(validVolume);
    // Recalculate the *other* value for all materials when total volume changes
    if (typeof validVolume === "number" && validVolume > 0) {
      setFormData((prev) => ({
        ...prev,
        materials: prev.materials.map((m) => {
          if (materialInputMode === "volume") {
            // User is entering volume, recalc fraction
            return { ...m, fraction: (m.volume ?? 0) / validVolume };
          } else {
            // User is entering percentage, recalc volume
            return { ...m, volume: m.fraction * validVolume };
          }
        }),
      }));
    } else {
      // If total volume becomes invalid, clear the calculated values
      setFormData((prev) => ({
        ...prev,
        materials: prev.materials.map((m) => {
          if (materialInputMode === "volume") return { ...m, fraction: 0 };
          else return { ...m, volume: null };
        }),
      }));
    }
  };
  const handleQuantityValueChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { value } = e.target;
    const numericValue = value === "" ? null : parseFloat(value);
    setFormData((prev) => ({
      ...prev,
      quantity: {
        ...prev.quantity,
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
  const handleClassificationChange = (
    _: React.SyntheticEvent,
    newValue: ClassificationOption | null
  ) => {
    setSelectedClassKey(newValue?.key || "");
    setFormData((prev) => ({
      ...prev,
      classification: newValue
        ? {
            id: newValue.id,
            name: newValue.name,
            system: newValue.system,
          }
        : null,
    }));
  };
  const handleLevelChange = (
    _: React.SyntheticEvent,
    newValue: string | null
  ) => {
    setFormData((prev) => ({ ...prev, level: newValue }));
  };
  const handleMaterialChange = (
    index: number,
    event: React.ChangeEvent<HTMLInputElement> | React.SyntheticEvent | null,
    fieldName: "name" | "fraction" | "volume",
    newValue?: string | null
  ) => {
    const updatedMaterials = [...formData.materials];
    let currentMaterial = { ...updatedMaterials[index] };

    if (fieldName === "name") {
      currentMaterial.name = newValue || "";
    } else if (fieldName === "fraction" || fieldName === "volume") {
      if (!event || !event.target) return;
      const { value } = event.target as HTMLInputElement;
      const displayValue = value.replace(/,/g, ".");

      if (fieldName === "fraction") {
        let numericFraction = 0;
        if (!(displayValue === "" || displayValue === ".")) {
          const numericValue = parseFloat(displayValue);
          if (!isNaN(numericValue)) {
            numericFraction = Math.min(100, Math.max(0, numericValue)) / 100;
          }
        }
        currentMaterial.fraction = numericFraction;
        if (typeof totalVolume === "number" && totalVolume > 0) {
          currentMaterial.volume = totalVolume * numericFraction;
        } else {
          currentMaterial.volume = null;
        }
      } else {
        let numericVolume = null;
        if (!(displayValue === "" || displayValue === ".")) {
          const numericValue = parseFloat(displayValue);
          if (!isNaN(numericValue)) {
            numericVolume = Math.max(0, numericValue);
          }
        }
        currentMaterial.volume = numericVolume;
        if (
          typeof totalVolume === "number" &&
          totalVolume > 0 &&
          typeof numericVolume === "number"
        ) {
          currentMaterial.fraction = numericVolume / totalVolume;
        } else {
          currentMaterial.fraction = 0;
        }
      }
    }
    updatedMaterials[index] = currentMaterial;
    setFormData((prev) => ({ ...prev, materials: updatedMaterials }));
  };

  const addMaterial = () => {
    setFormData((prev) => {
      const newMaterials = [
        ...prev.materials,
        { name: "", fraction: 0, volume: 0 },
      ];
      const numMaterials = newMaterials.length;

      // If in percentage mode, auto-distribute fractions
      if (materialInputMode === "percentage") {
        const equalFraction = numMaterials > 0 ? 1.0 / numMaterials : 0;
        const updated = newMaterials.map((mat) => ({
          ...mat,
          fraction: equalFraction,
          // Calculate volume based on new fraction if possible
          volume:
            typeof totalVolume === "number" && totalVolume > 0
              ? totalVolume * equalFraction
              : null,
        }));
        return { ...prev, materials: updated };
      } else {
        // In volume mode, just add the new material with 0s
        return { ...prev, materials: newMaterials };
      }
    });
  };
  const removeMaterial = (index: number) => {
    setFormData((prev) => {
      const updatedMaterials = prev.materials.filter((_, i) => i !== index);
      const numMaterials = updatedMaterials.length;
      if (numMaterials === 0) {
        setTotalVolume(null);
        setMaterialFractionError("");
        setMaterialVolumeError("");
      }
      // No redistribution needed on remove
      return { ...prev, materials: updatedMaterials };
    });
  };

  const handleInitialVolumeInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setInitialVolumeInput(e.target.value);
    if (initialVolumeError) {
      setInitialVolumeError("");
    }
  };

  const handleSubmitWithoutMaterials = () => {
    if (!isStep1Valid || !isStep2Valid) {
      console.error("Steps 1/2 invalid");
      setStep(1);
      return;
    }
    const finalQuantityValue =
      typeof formData.quantity.value === "number"
        ? formData.quantity.value
        : null;
    const dataToSubmit: ManualElementInput = {
      name: formData.name,
      type: formData.type,
      level: formData.level,
      quantity: { ...formData.quantity, value: finalQuantityValue },
      classification: formData.classification,
      materials: [],
      totalVolume: null,
      description: formData.description,
    };
    onSubmit(dataToSubmit, initialData?.id || null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !isStep1Valid ||
      !isStep2Valid ||
      formData.materials.length === 0 ||
      !isStep3Valid
    ) {
      console.error(
        "Submit triggered but form state is invalid for materials path."
      );
      if (!isStep1Valid || !isStep2Valid) setStep(1);
      else setStep(3);
      return;
    }

    const finalQuantityValue =
      typeof formData.quantity.value === "number"
        ? formData.quantity.value
        : null;
    const finalClassificationData = formData.classification;
    const finalTotalVolume = totalVolume; // Already validated by isStep3Valid

    // Ensure final materials sent ONLY have name and CORRECT fraction
    let finalMaterialsForSubmit: { name: string; fraction: number }[] = [];
    if (typeof finalTotalVolume === "number" && finalTotalVolume > 0) {
      finalMaterialsForSubmit = formData.materials.map((m) => ({
        name: m.name,
        // Use stored fraction, ensure it's correct based on final validation
        fraction: m.fraction,
      }));
      // Final check on fractions before submit
      const recalcFractionSum = finalMaterialsForSubmit.reduce(
        (sum, m) => sum + m.fraction,
        0
      );
      if (Math.abs(recalcFractionSum - 1.0) > 1e-5) {
        console.error("Final calculated fractions error!");
        setMaterialFractionError(
          "Fraktionen ergeben keine korrekte Summe (100%)."
        );
        setMaterialVolumeError(""); // Clear volume error if fraction error occurs
        return;
      }
    } else {
      console.error("Cannot finalize materials without valid total volume");
      return;
    }

    onSubmit(
      {
        name: formData.name,
        type: formData.type,
        level: formData.level,
        quantity: { ...formData.quantity, value: finalQuantityValue },
        classification: finalClassificationData,
        materials: finalMaterialsForSubmit, // Use the processed list
        totalVolume: finalTotalVolume,
        description: formData.description,
      },
      initialData?.id || null
    );
  };

  const handleAddFirstMaterial = () => {
    setInitialVolumeError("");
    const value = initialVolumeInput.replace(/,/g, ".");
    const numericVolume = parseFloat(value);

    if (isNaN(numericVolume) || numericVolume <= 0) {
      setInitialVolumeError("Bitte gültiges Volumen > 0 eingeben.");
      return;
    }

    // Set the main totalVolume state
    setTotalVolume(numericVolume);

    // Add the first material row (will use the just-set totalVolume if needed)
    addMaterial();

    // Clear the temporary input
    setInitialVolumeInput("");
  };

  const isStep1Valid = useMemo(
    () => !!formData.name && !!formData.type,
    [formData.name, formData.type]
  );
  const isStep2Valid = useMemo(
    () =>
      isStep1Valid &&
      typeof formData.quantity.value === "number" &&
      formData.quantity.value > 0 &&
      !!selectedClassKey,
    [isStep1Valid, formData.quantity.value, selectedClassKey]
  );
  const isStep3Valid = useMemo(() => {
    if (formData.materials.length === 0) return false;
    const allMaterialNamesValid = formData.materials.every((m) => !!m.name);
    const totalVolumeValid = typeof totalVolume === "number" && totalVolume > 0;
    const modeValid =
      materialInputMode === "percentage"
        ? !materialFractionError
        : !materialVolumeError;
    return totalVolumeValid && modeValid && allMaterialNamesValid;
  }, [
    totalVolume,
    materialInputMode,
    materialFractionError,
    materialVolumeError,
    formData.materials,
  ]);

  // --- Classification Options ---
  const classificationOptions = useMemo((): ClassificationOption[] => {
    const allOptions: ClassificationOption[] = ebkpData.map(
      (item: EbkpDataItem) => ({
        key: `EBKP-H-${item.code}`,
        display: `${item.code} - ${item.name}`,
        system: "EBKP-H",
        id: item.code,
        name: item.name,
        isPriority: false,
      })
    );
    const selectedIfcClass = formData.type;
    const priorityCodes = selectedIfcClass
      ? ifcClassToEbkpPriority[selectedIfcClass]
      : undefined;
    if (!selectedIfcClass || !priorityCodes) {
      return allOptions.sort((a, b) => a.display.localeCompare(b.display));
    }
    const prioritizedOptions: ClassificationOption[] = [];
    const otherOptions: ClassificationOption[] = [];
    const priorityCodeSet = new Set(priorityCodes);
    allOptions.forEach((option) => {
      if (option.id && priorityCodeSet.has(option.id)) {
        option.isPriority = true;
        prioritizedOptions.push(option);
      } else {
        otherOptions.push(option);
      }
    });
    prioritizedOptions.sort(
      (a, b) =>
        priorityCodes.indexOf(a.id || "") - priorityCodes.indexOf(b.id || "")
    );
    otherOptions.sort((a, b) => a.display.localeCompare(b.display));
    return [...prioritizedOptions, ...otherOptions];
  }, [formData.type]);

  // --- Render Logic ---
  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ p: 3, pb: 10 }}>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        {initialData
          ? "Manuelles Element Bearbeiten"
          : "Neues Manuelles Element"}
      </Typography>

      {/* --- Step 1: Core Info --- */}
      <Typography variant="overline" display="block" gutterBottom>
        Schritt 1: Basisinformationen
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={7}>
          <TextField
            required
            fullWidth
            label="Element Name"
            name="name"
            value={formData.name || ""}
            onChange={handleInputChange}
            size="small"
            error={!formData.name && step > 1}
            helperText={
              !formData.name && step > 1 ? "Name ist erforderlich" : ""
            }
          />
        </Grid>
        <Grid item xs={12} sm={5}>
          <FormControl
            fullWidth
            size="small"
            required
            error={!formData.type && step > 1}
          >
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
            {!formData.type && step > 1 && (
              <FormHelperText>Typ ist erforderlich</FormHelperText>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={12}>
          <Autocomplete
            freeSolo
            options={availableLevels}
            value={formData.level || ""}
            onChange={handleLevelChange}
            onInputChange={(_, newInputValue) => {
              setFormData((prev) => ({
                ...prev,
                level: newInputValue || null,
              }));
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Ebene / Geschoss (Optional)"
                name="level"
                size="small"
                fullWidth
              />
            )}
          />
        </Grid>
      </Grid>

      {/* --- Step 2: Quantity & Classification --- */}
      <Collapse
        in={initialData ? true : step >= 2}
        timeout="auto"
        unmountOnExit
      >
        <Divider sx={{ my: 3 }} />
        <Typography variant="overline" display="block" gutterBottom>
          Schritt 2: Menge & Klassifizierung
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4}>
            <TextField
              required
              fullWidth
              label="Menge"
              name="value"
              type="number"
              sx={{
                "& input[type=number]::-webkit-outer-spin-button": {
                  WebkitAppearance: "none",
                  margin: 0,
                },
                "& input[type=number]::-webkit-inner-spin-button": {
                  WebkitAppearance: "none",
                  margin: 0,
                },
                "& input[type=number]": {
                  MozAppearance: "textfield",
                },
              }}
              inputProps={{
                step: "any",
                sx: { textAlign: "right" },
              }}
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
                (formData.quantity.value === null ||
                  formData.quantity.value <= 0) &&
                (initialData ? true : step > 2)
              }
              helperText={
                (formData.quantity.value === null ||
                  formData.quantity.value <= 0) &&
                (initialData ? true : step > 2)
                  ? "Menge muss > 0 sein"
                  : ""
              }
            />
          </Grid>
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
          <Grid item xs={12} sm={4}></Grid>

          <Grid item xs={12}>
            <Autocomplete
              options={classificationOptions}
              getOptionLabel={(option) => option.display || ""}
              value={
                classificationOptions.find(
                  (opt) => opt.key === selectedClassKey
                ) || null
              }
              onChange={handleClassificationChange}
              isOptionEqualToValue={(option, value) => option.key === value.key}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="EBKP-H Klassifikation"
                  required
                  size="small"
                  error={!selectedClassKey && (initialData ? true : step > 2)}
                  helperText={
                    !selectedClassKey && (initialData ? true : step > 2)
                      ? "Klassifikation ist erforderlich"
                      : ""
                  }
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.key}>
                  {option.isPriority && (
                    <StarIcon
                      fontSize="small"
                      sx={{
                        color: "warning.main",
                        mr: 1,
                        verticalAlign: "bottom",
                      }}
                    />
                  )}
                  {option.display}
                </Box>
              )}
              fullWidth
              size="small"
            />
          </Grid>
        </Grid>
      </Collapse>

      {/* --- Step 3: Materials Input & SAVE --- */}
      <Collapse
        in={initialData ? true : step === 3}
        timeout="auto"
        unmountOnExit
      >
        <Divider sx={{ my: 3 }} />
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 1,
          }}
        >
          <Typography variant="overline" display="block" gutterBottom>
            {initialData
              ? "Materialien Bearbeiten & Speichern"
              : "Schritt 3: Materialien Definieren & Speichern"}
          </Typography>
          {(formData.materials.length > 0 || initialData) && (
            <ModeToggleContainer sx={{ mb: 1 }}>
              <Tooltip title="Anteile (%) Eingeben" arrow>
                <ModeToggleButton
                  active={materialInputMode === "percentage"}
                  onClick={() => setMaterialInputMode("percentage")}
                  sx={{ mr: 0.5 }}
                >
                  <PercentIcon fontSize="small" />
                </ModeToggleButton>
              </Tooltip>
              <Tooltip title="Volumen (m³) Eingeben" arrow>
                <ModeToggleButton
                  active={materialInputMode === "volume"}
                  onClick={() => setMaterialInputMode("volume")}
                  disabled={!totalVolume || totalVolume <= 0}
                >
                  <ViewInArIcon fontSize="small" />
                </ModeToggleButton>
              </Tooltip>
            </ModeToggleContainer>
          )}
        </Box>

        {formData.materials.length === 0 && !initialData && (
          <Grid container spacing={2} sx={{ mb: 3, justifyContent: "center" }}>
            <Grid item xs={12} md={8} lg={7} sx={{ textAlign: "center" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: (theme) => `${theme.shape.borderRadius}px`,
                  overflow: "hidden",
                  maxWidth: "550px",
                  mx: "auto",
                }}
              >
                <TextField
                  variant="standard"
                  placeholder="Gesamtvolumen des Elements (m³)"
                  value={initialVolumeInput}
                  onChange={handleInitialVolumeInputChange}
                  type="text"
                  inputMode="decimal"
                  error={!!initialVolumeError}
                  sx={{
                    flexGrow: 1,
                    px: 1.5,
                    py: 1,
                    "& .MuiInput-underline:before": { borderBottom: "none" },
                    "& .MuiInput-underline:after": { borderBottom: "none" },
                    "& .MuiInput-underline:hover:not(.Mui-disabled):before": {
                      borderBottom: "none",
                    },
                  }}
                  InputProps={{ disableUnderline: true }}
                />
                <Button
                  variant="contained"
                  onClick={handleAddFirstMaterial}
                  disabled={
                    !initialVolumeInput ||
                    isNaN(parseFloat(initialVolumeInput.replace(/,/g, "."))) ||
                    parseFloat(initialVolumeInput.replace(/,/g, ".")) <= 0
                  }
                  sx={{
                    borderRadius: (theme) =>
                      `0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0`,
                    height: "48px",
                    boxShadow: "none",
                    whiteSpace: "nowrap",
                    px: 3,
                  }}
                >
                  Erstes Material hinzufügen
                </Button>
              </Box>
              {initialVolumeError && (
                <FormHelperText error sx={{ textAlign: "left", ml: 2 }}>
                  {initialVolumeError}
                </FormHelperText>
              )}
              <Typography
                variant="caption"
                display="block"
                color="textSecondary"
                sx={{ mt: 1, textAlign: "center" }}
              >
                Gesamtvolumen für Ökobilanzierung benötigt. Danach
                Materialdetails eingeben.
              </Typography>
            </Grid>
          </Grid>
        )}

        {(formData.materials.length > 0 ||
          (initialData && formData.materials.length > 0)) && (
          <>
            <Grid container spacing={2} sx={{ mb: 1 }}>
              <Grid item xs={12}>
                <Typography variant="subtitle1">
                  Gesamtvolumen & Materialdetails
                </Typography>
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextField
                  required={formData.materials.length > 0}
                  fullWidth
                  label="Gesamtvolumen des Elements (m³)"
                  name="totalVolume"
                  type="number"
                  sx={{
                    "& input[type=number]::-webkit-outer-spin-button": {
                      WebkitAppearance: "none",
                      margin: 0,
                    },
                    "& input[type=number]::-webkit-inner-spin-button": {
                      WebkitAppearance: "none",
                      margin: 0,
                    },
                    "& input[type=number]": { MozAppearance: "textfield" },
                  }}
                  inputProps={{
                    step: "any",
                    min: 0,
                    sx: { textAlign: "right" },
                  }}
                  value={totalVolume ?? ""}
                  onChange={handleTotalVolumeChange}
                  size="small"
                  error={
                    formData.materials.length > 0 &&
                    (!totalVolume || totalVolume <= 0)
                  }
                  helperText={
                    formData.materials.length > 0 &&
                    (!totalVolume || totalVolume <= 0)
                      ? "Gesamtvolumen > 0 erforderlich"
                      : "Wird für die Ökobilanzierung benötigt."
                  }
                />
              </Grid>
              <Grid item xs={12} sm={4} sx={{ textAlign: "right" }}>
                <Button
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={addMaterial}
                  size="small"
                >
                  Material hinzufügen
                </Button>
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              {formData.materials.map((material, index) => {
                // Calculate PREVIEW value (the one NOT being input)
                let previewValue: string | null = null;
                let previewTitle: string = "";
                if (
                  materialInputMode === "percentage" &&
                  typeof totalVolume === "number" &&
                  totalVolume > 0 &&
                  typeof material.fraction === "number"
                ) {
                  const vol = totalVolume * material.fraction;
                  previewValue = `≈ ${vol.toFixed(3)} m³`;
                  previewTitle = `${vol.toFixed(6)} m³`;
                } else if (
                  materialInputMode === "volume" &&
                  typeof totalVolume === "number" &&
                  totalVolume > 0 &&
                  typeof material.volume === "number"
                ) {
                  const frac =
                    totalVolume > 0 ? (material.volume / totalVolume) * 100 : 0;
                  previewValue = `≈ ${frac.toFixed(1)} %`;
                  previewTitle = `${frac.toFixed(4)} %`;
                }

                return (
                  <React.Fragment key={index}>
                    {/* Material Name */}
                    <Grid item xs={12} sm={5}>
                      <Autocomplete
                        freeSolo
                        options={availableMaterialNames}
                        value={material.name || ""}
                        onChange={(event, newValue) => {
                          handleMaterialChange(index, event, "name", newValue);
                        }}
                        onInputChange={(_, newInputValue) => {
                          handleMaterialChange(
                            index,
                            null,
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
                            helperText={
                              !material.name ? "Name ist erforderlich" : ""
                            }
                          />
                        )}
                      />
                    </Grid>

                    {/* Conditional Input & Preview */}
                    <Grid item xs={12} sm={7}>
                      <Grid container spacing={1} alignItems="center">
                        {/* Conditional Input Field */}
                        <Grid item xs={6}>
                          {materialInputMode === "percentage" ? (
                            <TextField
                              required
                              fullWidth
                              label={`Anteil ${index + 1}`}
                              name="fraction"
                              type="text"
                              inputMode="decimal"
                              value={
                                material.fraction !== undefined
                                  ? (material.fraction * 100).toLocaleString(
                                      undefined,
                                      { maximumFractionDigits: 4 }
                                    )
                                  : ""
                              }
                              onChange={(e) =>
                                handleMaterialChange(index, e, "fraction")
                              }
                              size="small"
                              error={!!materialFractionError}
                              InputProps={{
                                endAdornment: (
                                  <InputAdornment position="end">
                                    %
                                  </InputAdornment>
                                ),
                              }}
                            />
                          ) : (
                            // Volume Input Mode
                            <TextField
                              required
                              fullWidth
                              label={`Volumen ${index + 1}`}
                              name="volume"
                              type="text"
                              inputMode="decimal"
                              value={material.volume ?? ""}
                              onChange={(e) =>
                                handleMaterialChange(index, e, "volume")
                              }
                              size="small"
                              error={!!materialVolumeError}
                              InputProps={{
                                endAdornment: (
                                  <InputAdornment position="end">
                                    m³
                                  </InputAdornment>
                                ),
                              }}
                            />
                          )}
                        </Grid>
                        {/* Calculated Preview Value */}
                        <Grid item xs={5}>
                          {" "}
                          <Typography
                            variant="body2"
                            color="textSecondary"
                            sx={{
                              pl: 1,
                              fontStyle: "italic",
                              whiteSpace: "nowrap",
                            }}
                            title={previewTitle}
                          >
                            {previewValue}
                          </Typography>{" "}
                        </Grid>
                        {/* Remove Button */}
                        <Grid item xs={1} sx={{ textAlign: "right" }}>
                          {" "}
                          <IconButton
                            onClick={() => removeMaterial(index)}
                            color="error"
                            size="small"
                          >
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>{" "}
                        </Grid>
                      </Grid>
                    </Grid>
                  </React.Fragment>
                );
              })}
              {/* Fraction OR Volume Error */}
              {materialFractionError && (
                <Grid item xs={12}>
                  <FormHelperText error sx={{ mt: 0, textAlign: "right" }}>
                    {materialFractionError}
                  </FormHelperText>
                </Grid>
              )}
              {materialVolumeError && (
                <Grid item xs={12}>
                  <FormHelperText error sx={{ mt: 0, textAlign: "right" }}>
                    {materialVolumeError}
                  </FormHelperText>
                </Grid>
              )}
            </Grid>
          </>
        )}
      </Collapse>

      {/* --- Persistent Footer Action Bar --- */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          backgroundColor: "background.paper",
          borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 1100,
        }}
      >
        {/* Left-aligned Buttons (Back) */}
        <Box>
          {!initialData && step === 2 && (
            <Button onClick={() => setStep(1)}>Zurück zu Schritt 1</Button>
          )}
          {!initialData && step === 3 && (
            <Button onClick={() => setStep(2)}>Zurück zu Schritt 2</Button>
          )}
        </Box>

        {/* Right-aligned Buttons (Next/Save/Cancel) */}
        <Box>
          <Button onClick={onCancel} sx={{ mr: 1 }} disabled={isLoading}>
            Abbrechen
          </Button>

          {/* --- Conditional Actions --- */}

          {/* Editing Mode */}
          {initialData && (
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={isLoading || !isStep3Valid}
            >
              Änderungen speichern
            </Button>
          )}

          {/* Step 1 (New) */}
          {!initialData && step === 1 && (
            <Button
              variant="contained"
              disabled={!isStep1Valid}
              onClick={() => setStep(2)}
            >
              Weiter zu Schritt 2
            </Button>
          )}

          {/* Step 2 (New) */}
          {!initialData && step === 2 && (
            <>
              <Button
                variant="outlined"
                sx={{ mr: 1 }}
                disabled={!isStep2Valid}
                onClick={handleSubmitWithoutMaterials}
              >
                Ohne Materialien speichern & Schliessen
              </Button>
              <Button
                variant="contained"
                disabled={!isStep2Valid}
                onClick={() => setStep(3)}
              >
                Materialien hinzufügen
              </Button>
            </>
          )}

          {/* Step 3 (New) */}
          {!initialData && step === 3 && (
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={
                isLoading || !isStep3Valid || formData.materials.length === 0
              }
            >
              Element Speichern
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ManualElementForm;
