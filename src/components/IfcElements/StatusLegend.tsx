import React from "react";
import { Box, Typography, Tooltip } from "@mui/material";
import { ElementDisplayStatus, STATUS_CONFIG } from "../IfcElementsList"; // Import from parent

interface StatusLegendProps {
  presentStatuses: ElementDisplayStatus[];
}

const StatusLegend: React.FC<StatusLegendProps> = ({ presentStatuses }) => {
  // Determine which statuses to show based on what's present
  const statusesToShow = Object.entries(STATUS_CONFIG)
    .filter(([statusKey]) =>
      presentStatuses.includes(statusKey as ElementDisplayStatus)
    )
    .map(([_, config]) => config);

  // Optional: Sort to keep a consistent order
  statusesToShow.sort((a, b) => {
    const order: Record<string, number> = {
      "Manuell (Lokal)": 0, // Keep explicit manual label if needed
      "Ausstehend (IFC)": 1,
      "Lokal Bearbeitet": 2,
      Bestätigt: 3,
      // Add other potential status labels if necessary
    };
    // Use a large number for statuses not in the explicit order
    return (order[a.label] ?? 99) - (order[b.label] ?? 99);
  });

  // Don't render the legend if no relevant statuses are present
  if (statusesToShow.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {statusesToShow.map((status) => (
        <Tooltip
          key={`${status.label}-tooltip`}
          title={status.description}
          arrow
          placement="top"
        >
          <Box
            key={status.label}
            sx={{ display: "flex", alignItems: "center", gap: 0.8 }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: status.color,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {status.label}
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
};

export default StatusLegend;
