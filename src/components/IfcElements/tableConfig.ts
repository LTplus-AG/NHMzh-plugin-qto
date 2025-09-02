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
    flex: "0 1 180px",
    minWidth: "140px",
    align: "left",
    sortable: true,
  },
  {
    key: "menge",
    label: "Menge",
    flex: "0 0 160px",
    minWidth: "140px",
    align: "right",
    sortable: true,
  },
  {
    key: "ebkpCode",
    label: "EBKP Code",
    flex: "0 1 120px",
    minWidth: "100px",
    align: "left",
    sortable: true,
  },
  {
    key: "ebkpName",
    label: "EBKP Name",
    flex: "0 1 150px",
    minWidth: "120px",
    align: "left",
    sortable: true,
  },
];

// Common table styles following flexbox best practices
export const tableStyles = {
  root: {
    width: "100%",
    borderCollapse: "collapse" as const,
    tableLayout: "fixed" as const,
    minWidth: "900px", // Add minimum width to prevent shrinking
    "& thead, & tbody": {
      display: "block",
      width: "100%",
      minWidth: "inherit",
    },
    "& tr": {
      display: "flex",
      width: "100%",
      minWidth: "900px", // Fixed minimum width for all rows
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
    minWidth: "1000px", // Updated to match root minWidth
    position: "sticky" as const,
    top: 0,
    zIndex: 100,
    backgroundColor: "background.paper",
    borderBottom: "2px solid rgba(0, 0, 0, 0.12)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    minHeight: "64px", // Increased header height
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
    padding: "16px 24px", // Consistent with header padding
    fontSize: "0.875rem",
    borderBottom: "1px solid rgba(0, 0, 0, 0.08)", // Lighter border
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

// Group row layout configuration following web best practices
export const groupRowConfig = {
  mainGroup: {
    expandColumn: {
      width: "56px",
      minWidth: "56px",
      maxWidth: "56px",
      padding: "12px 8px",
    },
    contentColumn: {
      flex: "1 1 auto",
      minWidth: "400px",
      padding: "16px 24px",
    },
    countsColumn: {
      width: "280px",
      minWidth: "280px",
      padding: "16px 24px",
      textAlign: "right" as const,
    },
    statusColumn: {
      width: "120px",
      minWidth: "120px",
      padding: "16px 16px",
      textAlign: "center" as const,
    }
  },
  subGroup: {
    expandColumn: {
      width: "56px",
      minWidth: "56px", 
      maxWidth: "56px",
      padding: "12px 8px",
    },
    codeColumn: {
      flex: "1 1 auto",
      minWidth: "300px",
      padding: "16px 24px",
    },
    emptyColumn: {
      width: "120px",
      minWidth: "120px",
      padding: "16px 16px",
    },
    countsColumn: {
      width: "280px",
      minWidth: "280px",
      padding: "16px 24px",
      textAlign: "right" as const,
    },
    statusColumn: {
      width: "120px",
      minWidth: "120px",
      padding: "16px 16px",
      textAlign: "center" as const,
    }
  }
};

// Warning badge styling following Material Design principles
export const warningBadgeStyles = {
  backgroundColor: 'rgba(255, 152, 0, 0.08)',
  borderRadius: 2,
  px: 2,
  py: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  border: '1px solid rgba(255, 152, 0, 0.2)',
};

// Typography styles for group information following web typography best practices
export const groupInfoStyles = {
  primary: {
    fontSize: "0.875rem", // 14px
    fontWeight: 500,
    lineHeight: 1.5,
    color: "text.secondary",
  },
  secondary: {
    fontSize: "0.75rem", // 12px
    fontWeight: 400,
    lineHeight: 1.4,
    color: "text.secondary",
  },
  warning: {
    fontSize: '0.75rem', // 12px
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'warning.main',
  },
  title: {
    fontSize: "1rem", // 16px
    fontWeight: 600,
    lineHeight: 1.5,
    color: "text.primary",
  },
  subtitle: {
    fontSize: "0.875rem", // 14px
    fontWeight: 500,
    lineHeight: 1.5,
    color: "text.primary",
  }
};

// Table spacing configuration following 8px grid system
export const tableSpacing = {
  cellPadding: {
    vertical: 16,
    horizontal: 24,
  },
  rowHeight: {
    compact: 48,
    comfortable: 56,
    spacious: 64,
  },
  borderRadius: 8,
  iconSize: {
    small: 16,
    medium: 20,
    large: 24,
  }
}; 