import { useState, useEffect, useMemo } from "react";
import { IFCElement } from "../../types/types";
import { EbkpGroup } from "./types";

// Use IFCElement as the base type with optional additional fields
export interface BimElement extends Omit<IFCElement, "level"> {
  // Override properties that need different typing
  level?: string; // Make level optional string without null
}

const useBimSearch = (
  elements: IFCElement[],
  viewType: string = "grouped",
  ebkpGroups?: EbkpGroup[]
) => {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filter options based on input value with debounce
  useEffect(() => {
    if (inputValue) {
      setLoading(true);
      const timer = setTimeout(() => {
        setLoading(false);
      }, 200); // 200ms debounce
      return () => clearTimeout(timer);
    }
    setLoading(false);
  }, [inputValue]);

  const filteredOptions = useMemo(() => {
    // Check if we have ebkpGroups to use for grouped view mode
    if (viewType === "grouped" && ebkpGroups && ebkpGroups.length > 0) {

      // Extract all grouped elements from all EBKP groups
      const groupedElements: IFCElement[] = [];
      ebkpGroups.forEach((group) => {
        if (group.elements) {
          // Only add elements that are actually grouped (have groupedElements > 1)
          const grouped = group.elements.filter(
            (el: IFCElement) => el.groupedElements && el.groupedElements > 1
          );
          groupedElements.push(...grouped);
        }
      });



      // If we have an input, filter based on it
      if (inputValue) {
        const searchLower = inputValue.toLowerCase();
        return groupedElements
          .filter(
            (el) =>
              (el.type_name &&
                el.type_name.toLowerCase().includes(searchLower)) ||
              (el.name && el.name.toLowerCase().includes(searchLower)) ||
              (el.type && el.type.toLowerCase().includes(searchLower)) ||
              (el.level && el.level.toLowerCase().includes(searchLower))
          )
          .slice(0, 20);
      }

      // If no input, just return all grouped elements
      return groupedElements.slice(0, 100);
    }

    // When input is empty, show first 100 elements (respecting grouping)
    if (!inputValue) {
      if (viewType === "grouped") {
        // Show grouped elements first
        const groupedElements = elements.filter(
          (el) => el.groupedElements && el.groupedElements > 1
        );

        // If no grouped elements found, something might be wrong with grouping

        // Create a set to track which elements are included in groups
        const includedElementIds = new Set<string>();
        groupedElements.forEach((el) => {
          if (el.originalElementIds) {
            el.originalElementIds.forEach((id) => includedElementIds.add(id));
          }
        });

        // Add individual elements not included in groups
        const individualElements = elements.filter(
          (el) =>
            !(el.groupedElements && el.groupedElements > 1) &&
            !includedElementIds.has(el.global_id)
        );

        return [...groupedElements, ...individualElements].slice(0, 100);
      } else {
        // In individual mode, just return first 100 elements
        return elements.slice(0, 100);
      }
    }

    // Convert input to lowercase for case-insensitive comparison
    const searchLower = inputValue.toLowerCase();

    // For grouped view, we need to consider grouped elements
    // We'll create a map to track which elements are already included in grouped items
    const includedElementIds = new Set<string>();
    let results: IFCElement[] = [];

    if (viewType === "grouped") {
      // First find all grouped elements
      const groupedElements = elements.filter(
        (el) => el.groupedElements && el.groupedElements > 1
      );



      // Filter grouped elements that match
      const matchingGroups = groupedElements.filter((el) => {
        // Check if we're searching for something that might be in the type name
        if (el.type_name) {
          const typeNameLower = el.type_name.toLowerCase();
          if (typeNameLower.includes(searchLower)) {
            // This is a strong match on type_name
            if (el.originalElementIds) {
              el.originalElementIds.forEach((id) => includedElementIds.add(id));
            }
            return true;
          }
        }

        // If not a direct match on type_name, try other fields
        const matches =
          (el.type && el.type.toLowerCase().includes(searchLower)) ||
          (el.name &&
            el.name.toLowerCase() !== el.type_name?.toLowerCase() &&
            el.name.toLowerCase().includes(searchLower)) ||
          (el.level && el.level.toLowerCase().includes(searchLower)) ||
          (el.classification_id &&
            el.classification_id.toLowerCase().includes(searchLower)) ||
          (el.classification_name &&
            el.classification_name.toLowerCase().includes(searchLower));

        // If this group matches, add all its element IDs to the included set
        if (matches && el.originalElementIds) {
          el.originalElementIds.forEach((id) => includedElementIds.add(id));
        }

        return matches;
      });

      results.push(...matchingGroups);

      // Only add individual elements if we're searching for something very specific that didn't match any groups
      if (results.length === 0) {
        // Now filter individual elements that aren't part of any matched group
        const remainingElements = elements.filter((el) => {
          // Skip elements that are already included in groups
          if (includedElementIds.has(el.global_id)) {
            return false;
          }
          // Skip elements that are groups themselves
          if (el.groupedElements && el.groupedElements > 1) {
            return false;
          }

          return (
            (el.name && el.name.toLowerCase().includes(searchLower)) ||
            (el.type_name &&
              el.type_name.toLowerCase().includes(searchLower)) ||
            (el.type && el.type.toLowerCase().includes(searchLower)) ||
            (el.level && el.level.toLowerCase().includes(searchLower)) ||
            (el.classification_id &&
              el.classification_id.toLowerCase().includes(searchLower)) ||
            (el.classification_name &&
              el.classification_name.toLowerCase().includes(searchLower)) ||
                      (el.category && el.category.toLowerCase().includes(searchLower)) ||
          (el.global_id &&
            el.global_id.toLowerCase().includes(searchLower))
          );
        });

        results.push(...remainingElements);
      }
    } else {
      // In individual mode, search through all elements
      results = elements.filter(
        (el) =>
          (el.name && el.name.toLowerCase().includes(searchLower)) ||
          (el.type_name && el.type_name.toLowerCase().includes(searchLower)) ||
          (el.type && el.type.toLowerCase().includes(searchLower)) ||
          (el.level && el.level.toLowerCase().includes(searchLower)) ||
          (el.classification_id &&
            el.classification_id.toLowerCase().includes(searchLower)) ||
          (el.classification_name &&
            el.classification_name.toLowerCase().includes(searchLower)) ||
                  (el.category && el.category.toLowerCase().includes(searchLower)) ||
        (el.global_id && el.global_id.toLowerCase().includes(searchLower))
      );
    }

    // Return top 20 results to avoid overwhelming display
    return results.slice(0, 20);
  }, [elements, inputValue, viewType, ebkpGroups]);

  // Get no options text based on state
  const getNoOptionsText = () => {
    if (!elements || elements.length === 0) return "Keine Elemente verfügbar";
    if (inputValue.length === 0)
      return "Beginnen Sie zu tippen oder wählen Sie ein Element";
    if (loading) return "Wird geladen...";
    if (filteredOptions.length === 0)
      return "Keine passenden Elemente gefunden";
    return "Keine Optionen";
  };

  return {
    inputValue,
    setInputValue,
    open,
    setOpen,
    loading,
    filteredOptions,
    getNoOptionsText,
  };
};

export default useBimSearch;
