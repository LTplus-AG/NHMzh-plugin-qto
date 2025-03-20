import { useMemo } from "react";
import { IFCElement } from "../../../types/types";
import { EbkpGroup } from "../types";

export const useEbkpGroups = (
  elements: IFCElement[],
  classificationFilter: string
) => {
  // Get unique classification IDs
  const uniqueClassifications = useMemo(() => {
    const classifications = elements
      .filter(
        (el) =>
          el.classification_id ||
          el.classification_name ||
          el.classification_system
      )
      .map((el) => ({
        id: (el.classification_id as string) || "",
        name: (el.classification_name as string) || "",
        system: el.classification_system || "",
      }));

    // Remove duplicates by combining system and id/name
    const uniqueItems = new Map();
    classifications.forEach((cls) => {
      const key = cls.id
        ? `${cls.system}-${cls.id}`
        : `${cls.system}-${cls.name.substring(0, 20)}`;

      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, cls);
      }
    });

    return Array.from(uniqueItems.values()).sort((a, b) =>
      (a.id || a.name).localeCompare(b.id || b.name)
    );
  }, [elements]);

  // Apply filter and group by EBKP
  const ebkpGroups = useMemo(() => {
    // First filter by classification presence - only show elements with BOTH id and name
    const elementsWithValidClassification = elements.filter(
      (el) =>
        el.classification_id &&
        el.classification_name &&
        el.classification_system === "EBKP"
    );

    console.log(
      `Filtered to ${elementsWithValidClassification.length} elements with complete EBKP classification data`
    );

    // Then apply any user-selected filter
    const filteredElements = !classificationFilter
      ? elementsWithValidClassification
      : (() => {
          const [system, identifier] = classificationFilter.split("-");
          return elementsWithValidClassification.filter((el) => {
            if (identifier.includes(" ")) {
              // Filtering by name
              return (
                el.classification_system === system &&
                el.classification_name &&
                el.classification_name.includes(identifier)
              );
            } else {
              // Filtering by ID
              return (
                el.classification_system === system &&
                el.classification_id === identifier
              );
            }
          });
        })();

    // Group by EBKP code
    const groupedElements = new Map<string, EbkpGroup>();

    filteredElements.forEach((element) => {
      if (!element.classification_id) return;

      const ebkpCode = element.classification_id;

      if (!groupedElements.has(ebkpCode)) {
        groupedElements.set(ebkpCode, {
          code: ebkpCode,
          name: element.classification_name || null,
          elements: [],
        });
      }

      groupedElements.get(ebkpCode)?.elements.push(element);
    });

    // Convert to array and sort by EBKP code
    return Array.from(groupedElements.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [elements, classificationFilter]);

  return { ebkpGroups, uniqueClassifications };
};
