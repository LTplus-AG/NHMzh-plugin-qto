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
  id: string;
  global_id?: string;
  type: string;
  name: string;
  description?: string;
  properties: Record<string, any>;
  material_volumes?: Record<string, any>;
  level?: string;
  classification_id?: string;
  classification_name?: string;
  classification_system?: string;
  area?: number;
  length?: number;
  volume?: number;
  original_area?: number;
  quantity?: {
    value: number | null;
    type: "area" | "length";
    unit: string;
  };
  original_quantity?: {
    value: number | null;
    type: "area" | "length";
  } | null;
  category?: string;
  is_structural?: boolean;
  is_external?: boolean;
  ebkph?: string;
  materials?: Array<{
    name: string;
    fraction?: number;
    volume?: number;
    unit?: string;
  }>;
  classification?: {
    id?: string;
    name?: string;
    system?: string;
  };
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
