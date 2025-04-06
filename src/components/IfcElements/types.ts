import { IFCElement } from "../../types/types";

export interface EditedQuantity {
  originalArea?: number | null | undefined;
  newArea?: number | null | undefined;
  originalLength?: number | null | undefined;
  newLength?: number | null | undefined;
}

export interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}
