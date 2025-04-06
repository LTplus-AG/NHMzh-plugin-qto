import { useState, useEffect, useMemo } from "react";
import { IFCElement } from "../../types/types";

// Use IFCElement as the base type with optional additional fields
export interface BimElement extends Omit<IFCElement, "level"> {
  // Override properties that need different typing
  level?: string; // Make level optional string without null
}

export function useBimSearch(elements: IFCElement[]) {
  const [inputValue, setInputValue] = useState("");
  const [selectedElement, setSelectedElement] = useState<IFCElement | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (elements?.length > 0) {
    }
  }, [elements]);

  // Create filtered options when input changes
  const filteredOptions = useMemo(() => {
    // Guard against null or undefined elements
    if (!elements || elements.length === 0) {
      return [];
    }

    const filterValue = inputValue.toLowerCase().trim();

    if (!filterValue) return elements.slice(0, 100);

    // Start loading state for better UX
    setLoading(true);

    try {
      const filtered = elements
        .filter((option) => {
          // Guard against malformed elements
          if (!option) return false;

          // Check id
          if (option.id?.toLowerCase().includes(filterValue)) return true;

          // Check name
          if (option.name?.toLowerCase().includes(filterValue)) return true;

          // Check element type (mapped to 'type' field)
          if (option.type?.toLowerCase().includes(filterValue)) return true;

          // Check category
          if (option.category?.toLowerCase().includes(filterValue)) return true;

          // Check level (with null handling)
          if (option.level && option.level.toLowerCase().includes(filterValue))
            return true;

          // Check description (with null handling)
          if (
            option.description &&
            option.description.toLowerCase().includes(filterValue)
          )
            return true;

          // Check properties object if it exists
          if (option.properties) {
            return Object.entries(option.properties).some(([key, value]) => {
              // Check property keys
              if (key.toLowerCase().includes(filterValue)) return true;

              // Check property values if they're strings
              if (
                typeof value === "string" &&
                value.toLowerCase().includes(filterValue)
              ) {
                return true;
              }

              return false;
            });
          }

          return false;
        })
        .slice(0, 100);

      return filtered;
    } catch (error) {
      console.error("Error filtering options:", error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [inputValue, elements]);

  // Get no options text based on current state
  const getNoOptionsText = () => {
    if (!elements || elements.length === 0) return "Keine Elemente verfügbar";
    if (inputValue.trim() === "") return "Beginnen Sie zu tippen...";
    return "Keine passenden Elemente gefunden";
  };

  return {
    inputValue,
    setInputValue,
    selectedElement,
    setSelectedElement,
    open,
    setOpen,
    loading,
    filteredOptions,
    getNoOptionsText,
  };
}

export default useBimSearch;
