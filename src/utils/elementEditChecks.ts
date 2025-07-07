import { IFCElement } from '../types/types';

/**
 * Checks if an element has persisted edits by comparing current and original quantity values
 * @param element The IFC element to check
 * @returns true if the element has persisted edits, false otherwise
 */
export const checkPersistedEdit = (element: IFCElement): boolean => {
  const currentVal = element.quantity?.value;
  const originalVal = element.original_quantity?.value;
  if (
    currentVal !== null &&
    currentVal !== undefined &&
    !isNaN(currentVal) &&
    originalVal !== null &&
    originalVal !== undefined &&
    !isNaN(originalVal)
  ) {
    return Math.abs(currentVal - originalVal) > 1e-9;
  }
  return false;
}; 