import { useState, useCallback, useEffect } from "react";
import { ColumnConfig } from "../components/IfcElements/tableConfig";

export interface ColumnWidths {
  [key: string]: number;
}

const STORAGE_KEY = "qto_column_widths";

// Parse flex string to get initial width in pixels
const parseFlexWidth = (flex?: string): number => {
  if (!flex) return 150;
  
  // Extract the basis value from flex (e.g., "0 1 180px" -> 180)
  const match = flex.match(/(\d+)px/);
  return match ? parseInt(match[1], 10) : 150;
};

// Get default widths from column config
const getDefaultWidths = (columns: ColumnConfig[]): ColumnWidths => {
  const widths: ColumnWidths = {};
  columns.forEach((col) => {
    widths[col.key] = parseFlexWidth(col.flex);
  });
  return widths;
};

export const useResizableColumns = (columns: ColumnConfig[]) => {
  // Initialize from localStorage or defaults
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new columns
        return { ...getDefaultWidths(columns), ...parsed };
      }
    } catch (error) {
      console.error("Failed to load column widths:", error);
    }
    return getDefaultWidths(columns);
  });

  // Save to localStorage whenever widths change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(columnWidths));
    } catch (error) {
      console.error("Failed to save column widths:", error);
    }
  }, [columnWidths]);

  // Update a single column width
  const setColumnWidth = useCallback((columnKey: string, width: number) => {
    setColumnWidths((prev) => ({
      ...prev,
      [columnKey]: Math.max(width, 50), // Minimum width of 50px
    }));
  }, []);

  // Reset to default widths
  const resetColumnWidths = useCallback(() => {
    const defaults = getDefaultWidths(columns);
    setColumnWidths(defaults);
    localStorage.removeItem(STORAGE_KEY);
  }, [columns]);

  // Get computed style for a column with current width
  const getColumnStyle = useCallback(
    (column: ColumnConfig) => {
      const width = columnWidths[column.key];
      const minWidth = column.minWidth || "50px";
      
      return {
        flex: `0 0 ${width}px`,
        minWidth,
        width: `${width}px`,
        maxWidth: `${width}px`,
        textAlign: column.align || "left",
        display: "flex",
        alignItems: "center",
        justifyContent:
          column.align === "right"
            ? "flex-end"
            : column.align === "center"
            ? "center"
            : "flex-start",
        position: "relative" as const,
        overflow: "hidden",
        ...column.sx,
      };
    },
    [columnWidths]
  );

  return {
    columnWidths,
    setColumnWidth,
    resetColumnWidths,
    getColumnStyle,
  };
};

