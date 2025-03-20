import { CSSProperties } from "react";
import { ColumnWidthsType } from "./types";

// Define percentage-based column widths for better consistency
export const columnWidths: ColumnWidthsType = {
  expandIcon: "48px",
  ebkp: "100px",
  bezeichnung: "250px",
  menge: "80px",
  einheit: "80px",
  kennwert: "80px",
  chf: "100px",
  totalChf: "120px",
  kommentar: "180px",
};

// Column highlight colors
export const columnHighlights = {
  kennwert: "rgba(245, 245, 245, 0.5)",
  chf: "rgba(245, 245, 245, 0.5)",
  totalChf: "rgba(235, 235, 235, 0.7)",
};

// Create table column styles with consistent widths
export const getColumnStyle = (columnName: string) => {
  switch (columnName) {
    case "menge":
    case "kennwert":
    case "chf":
    case "totalChf":
      return { textAlign: "right" as const };
    default:
      return {};
  }
};

// Cell styles for alignment and formatting
export const createCellStyles = (isMobile: boolean) => {
  return {
    text: {
      padding: isMobile ? "8px 4px" : "16px 8px",
      fontSize: isMobile ? "0.8rem" : "0.875rem",
    },
    number: {
      padding: isMobile ? "8px 4px" : "16px 8px",
      textAlign: "right" as const,
      fontFamily: "monospace",
      fontSize: isMobile ? "0.8rem" : "0.875rem",
    },
    currency: {
      padding: isMobile ? "8px 4px" : "16px 8px",
      textAlign: "right" as const,
      fontFamily: "monospace",
      fontWeight: "bold",
      fontSize: isMobile ? "0.8rem" : "0.875rem",
    },
  };
};

// For backwards compatibility
export const cellStyles = {
  childRow: {
    backgroundColor: "rgba(0, 0, 0, 0.02)",
  },
  grandchildRow: {
    backgroundColor: "white",
  },
  menge: {
    textAlign: "right" as const,
  },
  standardBorder: {
    borderLeft: "1px solid rgba(224, 224, 224, 1)",
  },
  kennwert: {
    textAlign: "right" as const,
  },
  chf: {
    textAlign: "right" as const,
  },
  totalChf: {
    textAlign: "right" as const,
    fontWeight: "bold",
  },
  header: {
    backgroundColor: "rgba(0, 0, 0, 0.08)",
    fontWeight: "bold",
  },
};

// Table container style
export const createTableContainerStyle = (
  isMobile: boolean
): CSSProperties => ({
  maxHeight: isMobile ? "unset" : "calc(100vh - 240px)",
  overflow: "auto",
  position: "relative",
  borderRadius: "4px",
});

// Table style
export const tableStyle = {
  tableLayout: "fixed" as const,
  width: "100%",
  minWidth: "1200px", // Add minimum width to all tables
  borderCollapse: "collapse" as const,
  overflowX: "clip" as const,
  "& .MuiTableCell-alignRight": {
    textAlign: "right",
  },
  "& td": {
    padding: "16px 0 16px 8px",
  },
  "& th": {
    padding: "16px 0 16px 8px",
    fontWeight: "bold",
    backgroundColor: "#f5f5f5",
    position: "sticky" as const,
    top: 0,
    zIndex: 1,
  },
};
