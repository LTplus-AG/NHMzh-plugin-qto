export interface ExcelQuantityData {
  value: number | null;
  type: 'area' | 'length' | 'volume' | 'count';
  unit: string;
}

export interface ExcelMaterialData {
  name: string;
  fraction?: number;
  volume?: number;
  unit?: string;
}

export interface ExcelElementData {
  global_id: string;
  name?: string;
  type?: string;
  level?: string;
  quantity?: ExcelQuantityData;
  area?: number | null;
  length?: number | null;
  volume?: number | null;
  classification_id?: string;
  classification_name?: string;
  classification_system?: string;
  materials?: ExcelMaterialData[];
}

export interface ExcelImportValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExcelPreviewData {
  element: ExcelElementData;
  validation: ExcelImportValidation;
  isNew: boolean;
  hasChanges: boolean;
  existingElement?: ExcelElementData;
}

export interface ExcelImportSummary {
  totalElements: number;
  newElements: number;
  updatedElements: number;
  errorElements: number;
  warningElements: number;
  validElements: number;
}

export const EXCEL_COLUMN_MAPPING = {
  GUID: 'GUID',
  NAME: 'Name',
  TYPE: 'Typ',
  LEVEL: 'Ebene',
  QUANTITY: 'Menge',
  UNIT: 'Einheit',
  AREA: 'Fläche (m²)',
  LENGTH: 'Länge (m)',
  VOLUME: 'Volumen (m³)',
  CLASSIFICATION_ID: 'Klassifikation ID',
  CLASSIFICATION_NAME: 'Klassifikation Name',
  MATERIALS: 'Materialien'
} as const;

export const SUPPORTED_UNITS = {
  AREA: ['m²', 'm2', 'qm'],
  LENGTH: ['m', 'meter'],
  VOLUME: ['m³', 'm3', 'cbm'],
  COUNT: ['Stk', 'Stück', 'pcs', 'St']
} as const;

export const UNIT_CONVERSIONS = {
  'm2': 'm²',
  'qm': 'm²',
  'm3': 'm³',
  'cbm': 'm³',
  'pcs': 'Stk',
  'St': 'Stk'
} as const;

export function normalizeUnit(unit: string): string {
  const normalizedUnit = unit.trim().toLowerCase();
  
  // Check for direct conversions
  for (const [key, value] of Object.entries(UNIT_CONVERSIONS)) {
    if (normalizedUnit === key.toLowerCase()) {
      return value;
    }
  }
  
  // Return original unit if no conversion found
  return unit;
}

export function validateQuantityUnit(value: number, unit: string): ExcelImportValidation {
  const validation: ExcelImportValidation = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  if (value <= 0) {
    validation.warnings.push(`Menge ${value} ist nicht positiv`);
  }
  
  const normalizedUnit = normalizeUnit(unit);
  const allSupportedUnits: string[] = [
    ...SUPPORTED_UNITS.AREA,
    ...SUPPORTED_UNITS.LENGTH,
    ...SUPPORTED_UNITS.VOLUME,
    ...SUPPORTED_UNITS.COUNT
  ];
  
  if (!allSupportedUnits.includes(normalizedUnit)) {
    validation.warnings.push(`Einheit '${unit}' ist nicht in der Liste der finanzierten Einheiten`);
  }
  
  return validation;
}

export function getQuantityTypeFromUnit(unit: string): 'area' | 'length' | 'volume' | 'count' {
  const normalizedUnit = normalizeUnit(unit);
  
  if ((SUPPORTED_UNITS.AREA as readonly string[]).includes(normalizedUnit)) {
    return 'area';
  } else if ((SUPPORTED_UNITS.LENGTH as readonly string[]).includes(normalizedUnit)) {
    return 'length';
  } else if ((SUPPORTED_UNITS.VOLUME as readonly string[]).includes(normalizedUnit)) {
    return 'volume';
  } else if ((SUPPORTED_UNITS.COUNT as readonly string[]).includes(normalizedUnit)) {
    return 'count';
  }
  
  // Default to area if unit is not recognized
  return 'area';
} 