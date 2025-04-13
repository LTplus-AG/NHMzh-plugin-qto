export interface ManualMaterialInput {
  name: string;
  fraction: number; // Stored as 0-1
  // Add other fields if needed, e.g., unit, volume (though volume might be calculated)
}

export interface ManualQuantityInput {
  value: number | null; // Allow null for unset/invalid state
  type: string; // "area", "length", "volume", "count"
  unit: string; // "m²", "m", "m³", "pcs"
}

export interface ManualClassificationInput {
  id: string | null;
  name: string | null;
  system: string | null;
}

export interface ManualElementInput {
  name: string;
  type: string;
  level: string | null;
  quantity: ManualQuantityInput;
  classification: ManualClassificationInput | null;
  materials: ManualMaterialInput[];
  totalVolume?: number | null;
  description: string | null;
}
