// Define shared types for the API client

export type QuantityType = "area" | "length" | "volume" | "count";

export interface QuantityData {
  value?: number | null;
  type?: QuantityType | null;
  unit?: string | null;
}

export interface ElementQuantityUpdate {
  global_id: string;
  new_quantity: {
    value: number | null;
    // Make sure this aligns with backend expectations
    type: QuantityType;
    unit: string;
  };
}
