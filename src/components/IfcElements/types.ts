import { IFCElement } from "../../types/types";

export interface EditedQuantity {
  originalArea?: number | null;
  newArea?: number | null;
  originalLength?: number | null;
  newLength?: number | null;

  originalQuantity?: {
    value: number | null;
    type: "area" | "length";
  } | null;
  newQuantity?: {
    value: number | null;
    type: "area" | "length";
  } | null;
}

export interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}
