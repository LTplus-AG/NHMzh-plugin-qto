import React from "react";
import { Box, Tooltip, styled } from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";

interface ViewModeToggleProps {
  viewType: string;
  onChange: (viewType: string) => void;
}

// Styled components for toggle
const ToggleContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 20,
  padding: 2,
  width: "fit-content",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  transition: "box-shadow 0.2s ease-in-out",
  "&:hover": {
    boxShadow: "0 2px 5px rgba(0,0,0,0.12)",
  },
}));

const ToggleButton = styled(Box, {
  shouldForwardProp: (prop) => prop !== "active",
})<{ active: boolean }>(({ theme, active }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 16,
  padding: "4px 8px",
  cursor: "pointer",
  transition: "all 0.2s",
  backgroundColor: active ? theme.palette.primary.main : "transparent",
  color: active
    ? theme.palette.primary.contrastText
    : theme.palette.text.secondary,
  "&:hover": {
    backgroundColor: active
      ? theme.palette.primary.main
      : theme.palette.action.hover,
  },
}));

const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  viewType,
  onChange,
}) => {
  return (
    <ToggleContainer>
      <Tooltip title="Alle Elemente einzeln anzeigen" arrow placement="top">
        <ToggleButton
          active={viewType === "individual"}
          onClick={() => onChange("individual")}
          sx={{ mr: 0.5 }}
        >
          <ViewListIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>

      <Tooltip
        title="Elemente nach Typ gruppieren (reduziert Listeneinträge)"
        arrow
        placement="top"
      >
        <ToggleButton
          active={viewType === "grouped"}
          onClick={() => onChange("grouped")}
        >
          <ViewModuleIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>
    </ToggleContainer>
  );
};

export default ViewModeToggle;
