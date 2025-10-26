import React from "react";

export interface CostItem {
  ebkp: string;
  bezeichnung: string;
  menge?: number;
  einheit?: string;
  kennwert?: number;
  chf?: number;
  totalChf?: number;
  kommentar?: string;
  children: CostItem[];
  expanded?: boolean;
}

export interface IFCElement {
  global_id: string;
  type: string;
  name: string;
  type_name?: string | null | undefined;
  description?: string | null | undefined;
  properties: Record<string, any>;
  material_volumes?: Record<
    string,
    {
      fraction?: number;
      volume?: number;
      width?: number;
    }
  > | null;
  level?: string | null;
  classification_id?: string | null | undefined;
  classification_name?: string | null | undefined;
  classification_system?: string | null | undefined;
  area?: number | null | undefined;
  length?: number | null | undefined;
  volume?: number | { net?: number; gross?: number } | null | undefined;
  original_area?: number | null | undefined;
  original_length?: number | null | undefined;
  original_volume?: number | null | undefined;
  quantity?: {
    value: number | null;
    type: string;
    unit?: string | null;
  } | null;
  original_quantity?: {
    value: number | null;
    type: string;
    unit?: string | null;
  } | null;
  category?: string;
  is_structural?: boolean;
  is_external?: boolean | null | undefined;
  ebkph?: string | null | undefined;
  materials?:
    | Array<{
        name: string;
        fraction?: number | null | undefined;
        volume?: number | null | undefined;
        unit?: string | null | undefined;
      }>
    | null
    | undefined;
  classification?:
    | {
        id?: string | null | undefined;
        name?: string | null | undefined;
        system?: string | null | undefined;
      }
    | null
    | undefined;
  groupedElements?: number;
  originalElementIds?: string[];
  hasPropertyDifferences?: boolean;
  hasZeroQuantityInGroup?: boolean; // Indicates if any element in the group has zero quantities
  status?: "pending" | "active" | null | undefined;
  is_manual?: boolean;
}

export interface EBKPItem {
  code: string;
  bezeichnung: string;
  children?: EBKPItem[];
}

export interface UploadedFile {
  filename: string;
  created_at: string;
  modelId?: string;
}

export interface MetaFile {
  file: File;
  steps: React.ReactElement[];
  valid: boolean | null;
  modelId?: string;
}

export const REQUIRED_HEADERS = {
  EBKP: "eBKP",
  BEZEICHNUNG: "Bezeichnung",
  MENGE: "Menge",
  EINHEIT: "Einheit",
  KENNWERT: "Kennwert",
  CHF: "CHF",
  TOTAL_CHF: "Total CHF",
  KOMMENTAR: "Kommentar",
};

export interface ColumnWidthsType {
  expandIcon: string;
  ebkp: string;
  bezeichnung: string;
  menge: string;
  einheit: string;
  kennwert: string;
  chf: string;
  totalChf: string;
  kommentar: string;
}

export const quantityConfig: {
      [key: string]: { key: "area" | "length" | "count"; unit: string };
} = {
  // Area-based elements (from backend config)
  IfcWall: { key: "area", unit: "m²" },
  IfcWallStandardCase: { key: "area", unit: "m²" },
  IfcSlab: { key: "area", unit: "m²" },
  IfcCovering: { key: "area", unit: "m²" },
  IfcRoof: { key: "area", unit: "m²" },
  IfcPlate: { key: "area", unit: "m²" },
  IfcCurtainWall: { key: "area", unit: "m²" },
  IfcWindow: { key: "area", unit: "m²" },
  IfcDoor: { key: "area", unit: "m²" },
  IfcBuildingElementPart: { key: "area", unit: "m²" },
  IfcBuildingElementProxy: { key: "area", unit: "m²" },
  IfcPile: { key: "area", unit: "m²" }, // Surface area
  IfcRampFlight: { key: "area", unit: "m²" },
  IfcSolarDevice: { key: "area", unit: "m²" },
  IfcDeepFoundation: { key: "area", unit: "m²" }, // Surface area
  IfcReinforcingMesh: { key: "area", unit: "m²" },
  
  // Length-based elements (from backend config)
  IfcBeam: { key: "length", unit: "m" },
  IfcBeamStandardCase: { key: "length", unit: "m" },
  IfcColumn: { key: "length", unit: "m" },
  IfcColumnStandardCase: { key: "length", unit: "m" },
  IfcRailing: { key: "length", unit: "m" },
  IfcReinforcingBar: { key: "length", unit: "m" },
  
  // Elements without specific quantities in backend (fallback to area)
  IfcEarthworksCut: { key: "area", unit: "m²" },
  IfcFooting: { key: "area", unit: "m²" },
  IfcMember: { key: "area", unit: "m²" },
  IfcCaissonFoundation: { key: "area", unit: "m²" },
  IfcReinforcingElement: { key: "area", unit: "m²" },
  IfcStairFlight: { key: "area", unit: "m²" },
  IfcStair: { key: "area", unit: "m²" },
  
  // Add other types as needed, default to area if not specified
};
