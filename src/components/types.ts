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
}

export interface IFCElement {
  id: string;
  global_id: string;
  type: string;
  name: string;
  description?: string | null;
  properties: Record<string, any>;
  material_volumes?: Record<string, any>;
  level?: string;
  area?: number;
  is_structural?: boolean;
  is_external?: boolean;
  ebkph?: string;
  category?: string;
  materials?: Array<{
    name: string;
    fraction: number;
    volume: number;
  }>;
  classification_id?: string | null;
  classification_name?: string | null;
  classification_system?: string | null;
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
