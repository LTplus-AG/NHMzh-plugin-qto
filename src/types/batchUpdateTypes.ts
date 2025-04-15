// Corresponds to BatchElementData in backend/main.py

// Re-use existing types if possible, or define specifically for the batch payload
import {
  ManualClassificationInput,
  ManualMaterialInput,
  ManualQuantityInput,
} from "./manualTypes";

/**
 * Represents the data structure for a single element within a batch update request.
 * Fields should align with the backend's BatchElementData Pydantic model.
 */
export interface BatchElementData {
  id: string; // Temporary ID for manual, ifc_id for existing
  global_id?: string | null;
  type: string;
  name: string;
  type_name?: string | null;
  description?: string | null;
  properties?: Record<string, any> | null;
  level?: string | null;
  classification?: ManualClassificationInput | null;
  materials?: ManualMaterialInput[] | null;
  quantity?: ManualQuantityInput | null;
  original_quantity?: ManualQuantityInput | null;
  area?: number | null;
  length?: number | null;
  volume?: number | null;
  original_area?: number | null;
  original_length?: number | null;
  is_manual?: boolean;
  is_structural?: boolean;
  is_external?: boolean;
}

/**
 * Represents the overall structure for a batch update request payload.
 */
export interface BatchUpdateRequest {
  elements: BatchElementData[];
}
