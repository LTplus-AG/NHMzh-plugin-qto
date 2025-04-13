import { useMemo } from "react";
import { IFCElement } from "../../../types/types";
import { EbkpGroup } from "../types";

// Helper to get a consistent classification key for filtering/grouping
const getClassificationKey = (el: IFCElement): string | null => {
  const classification = el.classification;
  if (classification?.id && classification?.system) {
    return `${classification.system}-${classification.id}`;
  } else if (classification?.name && classification?.system) {
    // Fallback for potential cases where only name/system exists
    return `${classification.system}-${classification.name}`;
  }
  return null;
};

export const useEbkpGroups = (
  elements: IFCElement[],
  classificationFilter: string[],
  viewType: string = "individual"
) => {
  console.log("[useEbkpGroups] Input elements:", elements);
  console.log("[useEbkpGroups] Classification Filter:", classificationFilter);
  console.log("[useEbkpGroups] View Type:", viewType);

  // Get unique classification IDs (from all elements, including manual)
  const uniqueClassifications = useMemo(() => {
    const uniqueItems = new Map<
      string,
      { id: string; name: string; system: string }
    >();

    elements.forEach((el) => {
      const key = getClassificationKey(el); // Use helper on the original element
      if (key && !uniqueItems.has(key) && el.classification) {
        // Store the necessary details from the nested classification object
        uniqueItems.set(key, {
          id: el.classification.id || "",
          name: el.classification.name || "",
          system: el.classification.system || "",
        });
      }
    });

    // Convert map values to array and sort
    return Array.from(uniqueItems.values()).sort((a, b) => {
      const displayA = `${a.system}-${a.id || a.name}`;
      const displayB = `${b.system}-${b.id || b.name}`;
      return displayA.localeCompare(displayB);
    });
  }, [elements]);

  // Apply filter and group
  const ebkpGroups = useMemo(() => {
    console.log(`useEbkpGroups processing with viewType: ${viewType}`);

    // 1. Separate manual and IFC elements
    const manualElements = elements.filter((el) => el.is_manual);
    const ifcElements = elements.filter((el) => !el.is_manual);

    // 2. Apply user's classificationFilter to BOTH lists
    let elementsToGroup: IFCElement[] = [];
    if (classificationFilter.length === 0) {
      // No filter active: include ALL manual elements and ALL IFC elements
      // (No strict EBKP pre-filtering on IFC elements anymore)
      elementsToGroup = [...ifcElements, ...manualElements];
    } else {
      // Filter active: check both lists
      const filterSet = new Set(classificationFilter); // Use Set for faster lookups

      const filteredIfc = ifcElements.filter((el) => {
        const key = getClassificationKey(el);
        return key ? filterSet.has(key) : false;
      });

      const filteredManual = manualElements.filter((el) => {
        const key = getClassificationKey(el);
        // Include manual if its classification matches OR if it has no classification (user might want to see unclassified manual items? TBD)
        // For now, let's only include if it matches the filter explicitly
        return key ? filterSet.has(key) : false;
      });

      elementsToGroup = [...filteredIfc, ...filteredManual];
    }

    // 3. Group the filtered elements
    const groupedElements = new Map<string, EbkpGroup>();
    const NO_CLASS_GROUP_CODE = "_NO_CLASS_"; // Special internal code for display

    elementsToGroup.forEach((element) => {
      let groupCode: string;
      let groupName: string | null;
      let displayCode: string; // Code shown in the UI row

      const classKey = getClassificationKey(element);

      if (classKey) {
        // Element has classification (could be manual or IFC)
        groupCode = classKey; // Group by the unique system-id/name key
        groupName = `${element.classification?.system || "System?"} - ${
          element.classification?.name || "Name?"
        }`;
        displayCode =
          element.classification?.id ||
          element.classification?.name ||
          groupCode; // Show ID or Name preferably
      } else {
        // Element has no classification (could be manual or IFC)
        groupCode = NO_CLASS_GROUP_CODE; // Use the same internal key
        groupName = "Ohne Klassifikation";
        displayCode = "Ohne"; // Display code for the row
      }

      if (!groupedElements.has(groupCode)) {
        groupedElements.set(groupCode, {
          code: displayCode,
          name: groupName,
          elements: [],
        });
      }
      groupedElements.get(groupCode)?.elements.push(element);
    });

    // 4. Apply 'grouped' view logic (merging within groups) if needed
    let finalGroups = Array.from(groupedElements.values());

    if (viewType === "grouped") {
      const groupedByType = new Map<string, EbkpGroup>();

      finalGroups.forEach((group) => {
        const originalGroupCode = group.code; // The display code
        const originalGroupName = group.name;
        const groupKeyForMap =
          Array.from(groupedElements.keys()).find(
            (key) => groupedElements.get(key) === group
          ) || originalGroupCode; // Find the unique map key

        if (!groupedByType.has(groupKeyForMap)) {
          groupedByType.set(groupKeyForMap, {
            code: originalGroupCode,
            name: originalGroupName,
            elements: [],
          });
        }

        // Group elements by type_name AND level within this group
        const typeGroups = new Map<string, IFCElement[]>();
        group.elements.forEach((element) => {
          // *** Do NOT merge manual elements ***
          if (element.is_manual) {
            // Add manual elements directly without merging
            groupedByType.get(groupKeyForMap)?.elements.push(element);
            return;
          }

          // Proceed with merging logic for non-manual elements
          const typeName = element.type_name || element.type || "Unknown Type";
          const level = element.level || "Unknown Level";
          const mergeKey = `${typeName}|${level}`;

          if (!typeGroups.has(mergeKey)) {
            typeGroups.set(mergeKey, []);
          }
          typeGroups.get(mergeKey)?.push(element);
        });

        // Process each type group to create merged elements
        typeGroups.forEach((elementsInTypeGroup, mergeKey) => {
          if (elementsInTypeGroup.length === 0) return;

          const [typeName, level] = mergeKey.split("|");

          if (elementsInTypeGroup.length === 1) {
            // If only one element, add it directly without creating a group ID
            groupedByType
              .get(groupKeyForMap)
              ?.elements.push(elementsInTypeGroup[0]);
          } else {
            // Create merged element if more than one
            const mergedElement: IFCElement = { ...elementsInTypeGroup[0] }; // Base on first
            mergedElement.id = `group-${groupKeyForMap}-${typeName.replace(
              /\s+/g,
              "-"
            )}-${level.replace(/\s+/g, "-")}`;
            mergedElement.name = typeName;
            mergedElement.type_name = typeName;
            mergedElement.level = level;
            mergedElement.groupedElements = elementsInTypeGroup.length;
            mergedElement.originalElementIds = elementsInTypeGroup.map(
              (el) => el.id
            );

            // Aggregate quantities, check for property differences, merge materials (existing logic)
            let hasPropertyDifferences = false;
            const firstElement = elementsInTypeGroup[0];
            for (let i = 1; i < elementsInTypeGroup.length; i++) {
              if (
                elementsInTypeGroup[i].is_structural !==
                  firstElement.is_structural ||
                elementsInTypeGroup[i].is_external !== firstElement.is_external
              ) {
                hasPropertyDifferences = true;
                break;
              }
            }
            mergedElement.hasPropertyDifferences = hasPropertyDifferences;

            mergedElement.area = elementsInTypeGroup.reduce(
              (sum, el) => sum + (el.area || 0),
              0
            );
            mergedElement.length = elementsInTypeGroup.reduce(
              (sum, el) => sum + (el.length || 0),
              0
            );
            mergedElement.volume = elementsInTypeGroup.reduce(
              (sum, el) => sum + (el.volume || 0),
              0
            );

            // Merge materials (existing logic)
            const materialMap = new Map<string, any>();
            let totalVolume = 0;
            elementsInTypeGroup.forEach((el) => {
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
            const materials = Array.from(materialMap.values());
            if (totalVolume > 0) {
              materials.forEach((material) => {
                if (material.volume !== undefined) {
                  material.fraction = material.volume / totalVolume;
                }
              });
            } else {
              const equalFraction = 1.0 / Math.max(1, materials.length);
              materials.forEach((material) => {
                material.fraction = equalFraction;
              });
            }
            mergedElement.materials = materials;

            groupedByType.get(groupKeyForMap)?.elements.push(mergedElement);
          }
        });
      });

      finalGroups = Array.from(groupedByType.values());
    }

    // 5. Final sorting (No Classification first, then by code)
    finalGroups.sort((a, b) => {
      const codeA =
        Array.from(groupedElements.keys()).find(
          (key) => groupedElements.get(key) === a
        ) || a.code; // Get original key
      const codeB =
        Array.from(groupedElements.keys()).find(
          (key) => groupedElements.get(key) === b
        ) || b.code; // Get original key

      if (codeA === NO_CLASS_GROUP_CODE && codeB !== NO_CLASS_GROUP_CODE)
        return -1;
      if (codeA !== NO_CLASS_GROUP_CODE && codeB === NO_CLASS_GROUP_CODE)
        return 1;
      // Sort the rest by the display code (e.g., EBKP ID or Name)
      return a.code.localeCompare(b.code);
    });

    console.log("[useEbkpGroups] Output groups:", finalGroups);
    return finalGroups;
  }, [elements, classificationFilter, viewType]);

  const hasEbkpGroups = ebkpGroups.length > 0;

  return { ebkpGroups, uniqueClassifications, hasEbkpGroups };
};
