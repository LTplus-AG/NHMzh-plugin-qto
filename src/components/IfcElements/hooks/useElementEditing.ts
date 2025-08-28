import { useState } from "react";
import { EditedQuantity } from "../types";
import logger from '../../../utils/logger';

export const useElementEditing = () => {
  const [editedElements, setEditedElements] = useState<
    Record<string, EditedQuantity>
  >({});

  // Get count of edited elements
  const editedElementsCount = Object.keys(editedElements).length;

  // Handle quantity changes (works for both area and length)
  const handleQuantityChange = (
    elementId: string,
    quantityKey: "area" | "length" | "count",
    originalValue: number | null | undefined,
    newValue: string
  ) => {
    const numericValue = newValue === "" ? null : parseFloat(newValue);
    logger.info(
      `[useElementEditing] Editing element ${elementId} ${quantityKey}: ${originalValue} -> ${numericValue}`
    );

    setEditedElements((prev) => {
      // If the new value is the same as original, remove from edited elements
      // Treat null, undefined, and 0 as equivalent for comparison
      const originalIsZeroish = originalValue === null || originalValue === undefined || originalValue === 0;
      const newIsZeroish = numericValue === null || numericValue === 0;
      
      if ((originalIsZeroish && newIsZeroish) || numericValue === originalValue) {
        const newEdited = { ...prev };
        // Make sure to remove all potential fields
        delete newEdited[elementId];
        logger.info(
          `[useElementEditing] Removed edit for element ${elementId} (back to original value)`
        );
        return newEdited;
      }

      // Otherwise update with new value based on quantity key
      const updatedElement: EditedQuantity = {
        ...prev[elementId], // Keep other edited properties if any
      };

      // Set the legacy fields for compatibility
      if (quantityKey === "area") {
        updatedElement.originalArea = originalValue;
        updatedElement.newArea = numericValue;
      } else if (quantityKey === "length") {
        updatedElement.originalLength = originalValue;
        updatedElement.newLength = numericValue;
      }

      // Add fields for new schema
      updatedElement.originalQuantity = {
        value: originalValue ?? null, // Ensure null if undefined
        type: quantityKey,
      };
      updatedElement.newQuantity = {
        value: numericValue,
        type: quantityKey,
      };

      logger.info(
        `[useElementEditing] Updated element ${elementId} with new ${quantityKey}: ${numericValue}`
      );

      return {
        ...prev,
        [elementId]: updatedElement,
      };
    });
  };

  // For backward compatibility - old method that only handles area
  const handleAreaChange = (
    elementId: string,
    originalArea: number | null | undefined,
    newValue: string
  ) => {
    // Call the new method with 'area' as the quantityKey
    handleQuantityChange(elementId, "area", originalArea, newValue);
  };

  // Reset all edits
  const resetEdits = () => {
    setEditedElements({});
  };

  return {
    editedElements,
    editedElementsCount,
    handleQuantityChange, // Primary handler
    handleAreaChange, // Keep for compatibility if necessary
    resetEdits,
  };
};
