// Corresponds to BatchElementData in backend/main.py

// Re-use existing types if possible, or define specifically for the batch payload
import { ManualClassificationInput, ManualMaterialInput, ManualQuantityInput } from "./manualTypes";

export interface BatchElementData {
    id: string; // Temporary ID for manual, ifc_id for existing
    global_id?: string | null;
    type: string;
    name: string;
    type_name?: string | null;
    description?: string | null;
    properties?: Record<string, any> | null;
    materials?: ManualMaterialInput[] | null;
    level?: string | null;
    quantity?: ManualQuantityInput | null;
    original_quantity?: ManualQuantityInput | null;
    classification?: ManualClassificationInput | null;
    is_manual?: boolean;
    is_structural?: boolean | null;
    is_external?: boolean | null;
} 