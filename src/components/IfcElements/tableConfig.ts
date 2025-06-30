import { SxProps, Theme } from "@mui/material";

// Define column configuration for perfect alignment
export interface ColumnConfig {
  key: string;
  label: string;
  width?: string;
  flex?: string;
  minWidth?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  sx?: SxProps<Theme>;
}

// Column definitions with flex properties
export const TABLE_COLUMNS: ColumnConfig[] = [
  {
    key: "expand",
    label: "",
    flex: "0 0 48px",
    minWidth: "48px",
    align: "center",
    sortable: false,
  },
  {
    key: "type",
    label: "Type",
    flex: "1 1 300px",
    minWidth: "200px",
    align: "left",
    sortable: true,
  },
  {
    key: "globalId",
    label: "GUID",
    flex: "0 1 180px",
    minWidth: "120px",
    align: "left",
    sortable: true,
  },
  {
    key: "kategorie",
    label: "Kategorie",
    flex: "0 1 160px",
    minWidth: "100px",
    align: "left",
    sortable: true,
  },
  {
    key: "ebene",
    label: "Ebene",
    flex: "0 1 120px",
    minWidth: "80px",
    align: "left",
    sortable: true,
  },
  {
    key: "menge",
    label: "Menge",
    flex: "0 0 140px",
    minWidth: "120px",
    align: "right",
    sortable: true,
  },
];

// Common table styles following flexbox best practices
export const tableStyles = {
  root: {
    width: "100%",
    borderCollapse: "collapse" as const,
    tableLayout: "fixed" as const,
    minWidth: "800px", // Add minimum width to prevent shrinking
    "& thead, & tbody": {
      display: "block",
      width: "100%",
      minWidth: "inherit",
    },
    "& tr": {
      display: "flex",
      width: "100%",
      minWidth: "800px", // Fixed minimum width for all rows
    },
  },
  container: {
    width: "100%",
    overflowX: "auto" as const,
    overflowY: "visible" as const,
    backgroundColor: "#fff",
    position: "relative" as const,
  },
  headerRow: {
    display: "flex",
    width: "100%",
    minWidth: "800px", // Fixed minimum width
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    backgroundColor: "#fff",
    borderBottom: "2px solid rgba(0, 0, 0, 0.12)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  dataRow: {
    display: "flex",
    width: "100%",
    minWidth: "800px", // Fixed minimum width
    minHeight: "52px",
    alignItems: "stretch",
    transition: "background-color 0.2s",
    "&:hover": {
      backgroundColor: "rgba(25, 118, 210, 0.04)",
    },
  },
  headerCell: {
    display: "flex",
    alignItems: "center",
    padding: "12px 8px",
    fontWeight: 600,
    fontSize: "0.875rem",
    color: "rgba(0, 0, 0, 0.87)",
    backgroundColor: "#fff",
    overflow: "hidden",
    position: "relative" as const,
    "&.sortable": {
      cursor: "pointer",
      "&:hover": {
        backgroundColor: "rgba(0, 0, 0, 0.04)",
      },
    },
  },
  dataCell: {
    display: "flex",
    alignItems: "center",
    padding: "8px",
    fontSize: "0.875rem",
    borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
    overflow: "hidden",
    position: "relative" as const,
    "& > *": {
      minWidth: 0, // Allow flex items to shrink below their content size
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
  },
  expandButton: {
    padding: "4px",
    "& .MuiSvgIcon-root": {
      fontSize: "1.1rem",
    },
  },
  zebraRow: {
    "&:nth-of-type(even)": {
      backgroundColor: "rgba(0, 0, 0, 0.02)",
    },
    "&:hover": {
      backgroundColor: "rgba(25, 118, 210, 0.04)",
    },
  },
};

// Helper function to get column style with flex properties
export const getColumnStyle = (column: ColumnConfig): SxProps<Theme> => ({
  flex: column.flex || "1 1 auto",
  minWidth: column.minWidth || "0",
  textAlign: column.align || "left",
  display: "flex",
  alignItems: "center",
  justifyContent: column.align === "right" ? "flex-end" : column.align === "center" ? "center" : "flex-start",
  position: "relative",
  overflow: "hidden",
  ...column.sx,
});

// Responsive breakpoints
export const responsiveBreakpoints = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
}; 