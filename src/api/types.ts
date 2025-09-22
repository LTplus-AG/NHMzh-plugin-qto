// Define shared types for the API client

export interface ElementQuantityUpdate {
  global_id: string;
  new_quantity: {
    value: number | null;
    // Make sure this aligns with backend expectations
    type: "area" | "length" | "volume" | string;
    unit: string;
  };
}
