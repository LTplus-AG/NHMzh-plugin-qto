import { IFCElement } from "../../types/types";

export interface EditedArea {
  originalArea: number | null | undefined;
  newArea: number | null | undefined;
}

export interface EbkpGroup {
  code: string;
  name: string | null;
  elements: IFCElement[];
}
