import { useState } from "react";
import { EditedArea } from "../types";

export const useElementEditing = () => {
  const [editedElements, setEditedElements] = useState<
    Record<string, EditedArea>
  >({});

  // Get count of edited elements
  const editedElementsCount = Object.keys(editedElements).length;

  // Handle area edit
  const handleAreaChange = (
    elementId: string,
    originalArea: number | null | undefined,
    newValue: string
  ) => {
    const newArea = newValue === "" ? null : parseFloat(newValue);

    setEditedElements((prev) => {
      // If the new value is the same as original, remove from edited elements
      if (newArea === originalArea) {
        const newEdited = { ...prev };
        delete newEdited[elementId];
        return newEdited;
      }

      // Otherwise update with new value
      return {
        ...prev,
        [elementId]: {
          originalArea,
          newArea,
        },
      };
    });
  };

  // Reset all edits
  const resetEdits = () => {
    setEditedElements({});
  };

  return {
    editedElements,
    editedElementsCount,
    handleAreaChange,
    resetEdits,
  };
};
