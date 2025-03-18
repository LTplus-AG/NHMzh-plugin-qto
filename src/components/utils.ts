import { CostItem } from "./types";

// Format numbers with appropriate thousand separators and decimal places
export const formatNumber = (
  num: number | null | undefined,
  decimals: number = 2
): string => {
  if (num === null || num === undefined || isNaN(num)) return "";

  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

// Extract and convert a number value from an Excel row
export const extractNumber = (
  row: Record<string, unknown>,
  header: string,
  columnIndex: number
): number | null => {
  // First try to get the value by header name
  let value = row[header];

  // If that didn't work, try to get it by index
  if (value === undefined && columnIndex >= 0) {
    // Some Excel libraries use numeric indexes as keys
    value = row[columnIndex];
  }

  // Handle empty or invalid values
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  // Parse the value as a number, handling different formats
  let numValue: number;
  if (typeof value === "number") {
    numValue = value;
  } else if (typeof value === "string") {
    // Replace comma with dot for decimal point
    const normalizedValue = value.replace(/,/g, ".");
    numValue = parseFloat(normalizedValue);
  } else {
    // Try to convert other types to number
    numValue = Number(value);
  }

  return isNaN(numValue) ? null : numValue;
};

// Define the interface for EBKP items
interface EBKPItem {
  code: string;
  bezeichnung: string;
}

// Process EBKP data into hierarchical CostItem structure
export const processEbkpData = (data: EBKPItem[]): CostItem[] => {
  const items: CostItem[] = [];
  const topLevelMap: Record<string, CostItem> = {};
  const secondLevelMap: Record<string, CostItem> = {};

  // First pass: Create top-level items (e.g., "A", "B", "C")
  data
    .filter((item) => /^[A-Z]$/.test(item.code))
    .forEach((item) => {
      const topLevelItem: CostItem = {
        ebkp: item.code,
        bezeichnung: item.bezeichnung,
        menge: null,
        einheit: "",
        kennwert: null,
        chf: null,
        totalChf: null,
        kommentar: "",
        children: [],
        expanded: false,
      };

      items.push(topLevelItem);
      topLevelMap[item.code] = topLevelItem;
    });

  // If no top-level items were found explicitly, create them from second-level codes
  if (Object.keys(topLevelMap).length === 0) {
    const uniqueFirstLetters = new Set<string>();

    data.forEach((item) => {
      if (item.code && /^[A-Z]/.test(item.code)) {
        uniqueFirstLetters.add(item.code[0]);
      }
    });

    uniqueFirstLetters.forEach((letter) => {
      const topLevelItem: CostItem = {
        ebkp: letter,
        bezeichnung: letter,
        menge: null,
        einheit: "",
        kennwert: null,
        chf: null,
        totalChf: null,
        kommentar: "",
        children: [],
        expanded: false,
      };

      items.push(topLevelItem);
      topLevelMap[letter] = topLevelItem;
    });
  }

  // Second pass: Create second-level items (e.g., "A1", "B2", "C3")
  data
    .filter((item) => /^[A-Z]\d+$/.test(item.code))
    .forEach((item) => {
      const parentCode = item.code[0];
      const parentItem = topLevelMap[parentCode];

      if (parentItem) {
        const secondLevelItem: CostItem = {
          ebkp: item.code,
          bezeichnung: item.bezeichnung,
          menge: null,
          einheit: "",
          kennwert: null,
          chf: null,
          totalChf: null,
          kommentar: "",
          children: [],
          expanded: false,
        };

        parentItem.children.push(secondLevelItem);
        secondLevelMap[item.code] = secondLevelItem;
      }
    });

  // Third pass: Create third-level items (e.g., "A1.1", "B2.1", "C3.1")
  data
    .filter((item) => item.code.includes("."))
    .forEach((item) => {
      const parentCode = item.code.split(".")[0];
      const parentItem = secondLevelMap[parentCode];

      if (parentItem) {
        const thirdLevelItem: CostItem = {
          ebkp: item.code,
          bezeichnung: item.bezeichnung,
          menge: null,
          einheit: "",
          kennwert: null,
          chf: null,
          totalChf: null,
          kommentar: "",
          children: [],
          expanded: false,
        };

        parentItem.children.push(thirdLevelItem);
      }
    });

  // Sort items alphabetically by EBKP code
  items.sort((a, b) => a.ebkp.localeCompare(b.ebkp));

  items.forEach((item) => {
    item.children.sort((a, b) => a.ebkp.localeCompare(b.ebkp));
    item.children.forEach((child) => {
      child.children.sort((a, b) => a.ebkp.localeCompare(b.ebkp));
    });
  });

  return items;
};
