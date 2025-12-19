import { IFCElement } from "../../types/types";

export interface EditedQuantity {
  originalArea?: number | null;
  newArea?: number | null;
  originalLength?: number | null;
  newLength?: number | null;

  originalQuantity?: {
    value: number | null;
    type: "area" | "length" | "count" | "volume";
  } | null;
  newQuantity?: {
    value: number | null;
    type: "area" | "length" | "count" | "volume";
  } | null;

  // Classification tracking
  originalClassification?: {
    id: string | null;
    name: string | null;
    system: string | null;
  } | null;
  newClassification?: {
    id: string | null;
    name: string | null;
    system: string | null;
  } | null;
}

export interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}

export interface HierarchicalEbkpGroup {
  mainGroup: string;
  mainGroupName: string;
  subGroups: EbkpGroup[];
  totalElements: number;
}
