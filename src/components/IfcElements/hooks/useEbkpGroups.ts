import { useMemo } from "react";
import { IFCElement } from "../../../types/types";
import { EbkpGroup } from "../types";

export const useEbkpGroups = (
  elements: IFCElement[],
  classificationFilter: string[],
  viewType: string = "individual"
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
    console.log(`useEbkpGroups running with viewType: ${viewType}`);

    // First filter by classification presence - only show elements with BOTH id and name
    const elementsWithValidClassification = elements.filter(
      (el) =>
        el.classification_id &&
        el.classification_name &&
        el.classification_system === "EBKP"
    );

    // Then apply any user-selected filter
    const filteredElements =
      classificationFilter.length === 0
        ? elementsWithValidClassification
        : elementsWithValidClassification.filter((el) => {
            // Construct the value string for the element's classification
            const elementFilterValue = el.classification_id
              ? `${el.classification_system}-${el.classification_id}`
              : `${el.classification_system}-${el.classification_name}`; // Fallback if ID is missing

            // Check if this element's classification value is included in the filter array
            return classificationFilter.includes(elementFilterValue);
          });

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

    // If viewType is 'individual', return the groups as is
    if (viewType === "individual") {
      // Convert to array and sort by EBKP code
      return Array.from(groupedElements.values()).sort((a, b) =>
        a.code.localeCompare(b.code)
      );
    }

    // For 'grouped' viewType, further group elements within each EBKP group by type_name
    const groupedByType = new Map<string, EbkpGroup>();

    // Process each EBKP group
    groupedElements.forEach((ebkpGroup) => {
      const ebkpCode = ebkpGroup.code;
      const ebkpName = ebkpGroup.name;

      // Create an entry for this EBKP code if it doesn't exist
      if (!groupedByType.has(ebkpCode)) {
        groupedByType.set(ebkpCode, {
          code: ebkpCode,
          name: ebkpName,
          elements: [],
        });
      }

      // Group elements by type_name AND level within this EBKP group
      const typeGroups = new Map<string, IFCElement[]>();
      ebkpGroup.elements.forEach((element) => {
        const typeName = element.type_name || element.type || "Unknown Type";
        const level = element.level || "Unknown Level";
        // Create a combined key using both type_name and level
        const groupKey = `${typeName}|${level}`;

        if (!typeGroups.has(groupKey)) {
          typeGroups.set(groupKey, []);
        }
        typeGroups.get(groupKey)?.push(element);
      });

      // Debug typeGroups
      console.log(
        `EBKP ${ebkpCode} has ${typeGroups.size} type groups:`,
        Array.from(typeGroups.keys()).map((key) => ({
          groupKey: key,
          count: typeGroups.get(key)?.length || 0,
        }))
      );

      // Process each type group to create merged elements
      typeGroups.forEach((elements, groupKey) => {
        if (elements.length === 0) return;

        // Extract type name and level from the group key
        const [typeName, level] = groupKey.split("|");

        // Create the base merged element from the first element
        const mergedElement: IFCElement = { ...elements[0] };

        // Add identifier to indicate this is a grouped element
        mergedElement.id = `group-${ebkpCode}-${typeName.replace(
          /\s+/g,
          "-"
        )}-${level.replace(/\s+/g, "-")}`;
        mergedElement.name = typeName;
        mergedElement.type_name = typeName;
        mergedElement.level = level;
        mergedElement.groupedElements = elements.length;

        // Check if all elements have identical properties
        let hasPropertyDifferences = false;

        // Only check for differences if there's more than one element
        if (elements.length > 1) {
          // Compare is_structural, is_external across all elements
          const firstElement = elements[0];
          for (let i = 1; i < elements.length; i++) {
            if (
              elements[i].is_structural !== firstElement.is_structural ||
              elements[i].is_external !== firstElement.is_external
            ) {
              hasPropertyDifferences = true;
              break;
            }
          }
        }

        // Store property difference flag
        mergedElement.hasPropertyDifferences = hasPropertyDifferences;

        // Sum up quantities
        mergedElement.area = elements.reduce(
          (sum, el) => sum + (el.area || 0),
          0
        );
        mergedElement.length = elements.reduce(
          (sum, el) => sum + (el.length || 0),
          0
        );
        mergedElement.volume = elements.reduce(
          (sum, el) => sum + (el.volume || 0),
          0
        );

        // Merge materials - sum up volumes with the same name
        const materialMap = new Map<string, any>();
        let totalVolume = 0;

        // First pass: Sum up all volumes
        elements.forEach((el) => {
          if (el.materials) {
            el.materials.forEach((mat) => {
              const name = mat.name;
              if (!materialMap.has(name)) {
                materialMap.set(name, { ...mat, volume: 0 });
              }

              const existingMat = materialMap.get(name);
              if (mat.volume !== undefined && mat.volume !== null) {
                existingMat.volume = (existingMat.volume || 0) + mat.volume;
                totalVolume += mat.volume;
              }
            });
          }
        });

        // Second pass: Calculate new fractions based on volumes
        const materials = Array.from(materialMap.values());

        if (totalVolume > 0) {
          // If we have volumes, calculate fractions based on volume proportions
          materials.forEach((material) => {
            if (material.volume !== undefined) {
              material.fraction = material.volume / totalVolume;
            }
          });
        } else {
          // If no volumes, distribute fractions evenly
          const equalFraction = 1.0 / Math.max(1, materials.length);
          materials.forEach((material) => {
            material.fraction = equalFraction;
          });
        }

        mergedElement.materials = materials;

        // Store all original element IDs
        mergedElement.originalElementIds = elements.map((el) => el.id);

        // Add to the EBKP group
        groupedByType.get(ebkpCode)?.elements.push(mergedElement);
      });
    });

    // Convert to array and sort by EBKP code
    const result = Array.from(groupedByType.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );

    // Log the total count of grouped elements
    if (viewType === "grouped") {
      const totalGroupedElements = result.reduce((sum, group) => {
        const groupedCount = group.elements.filter(
          (el) => el.groupedElements && el.groupedElements > 1
        ).length;
        return sum + groupedCount;
      }, 0);

      console.log(
        `Created ${totalGroupedElements} grouped elements across ${result.length} EBKP groups`
      );
    }

    return result;
  }, [elements, classificationFilter, viewType]);

  const hasEbkpGroups = ebkpGroups.length > 0;

  return { ebkpGroups, uniqueClassifications, hasEbkpGroups };
};
