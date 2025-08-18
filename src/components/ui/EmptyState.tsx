import {
  Box,
  Typography,
  Button,
  Paper,
  Stack,
} from "@mui/material";
import {
  Info as InfoIcon,
  FolderOff as FolderOffIcon,
  Upload as UploadIcon,
  Assessment as AssessmentIcon,
} from "@mui/icons-material";
import React from "react";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "contained" | "outlined" | "text";
  startIcon?: React.ReactNode;
}

interface EmptyStateProps {
  icon?: "info" | "folder" | "upload" | "assessment";
  title: string;
  description: string;
  actions?: EmptyStateAction[];
  maxWidth?: number;
}

const iconMap = {
  info: InfoIcon,
  folder: FolderOffIcon,
  upload: UploadIcon,
  assessment: AssessmentIcon,
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "info",
  title,
  description,
  actions = [],
  maxWidth = 500,
}) => {
  const IconComponent = iconMap[icon];

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="400px"
      p={3}
    >
      <Paper
        elevation={0}
        sx={{
          p: 4,
          textAlign: "center",
          maxWidth,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        <Stack spacing={3} alignItems="center">
          <IconComponent
            sx={{
              fontSize: 64,
              color: "text.secondary",
              opacity: 0.7,
            }}
          />
          
          <Box>
            <Typography
              variant="h6"
              component="h2"
              gutterBottom
              sx={{ fontWeight: 600, color: "text.primary" }}
            >
              {title}
            </Typography>
            
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ lineHeight: 1.6 }}
            >
              {description}
            </Typography>
          </Box>

          {actions.length > 0 && (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ mt: 3 }}
            >
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || "contained"}
                  onClick={action.onClick}
                  startIcon={action.startIcon}
                  size="medium"
                >
                  {action.label}
                </Button>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
};

export default EmptyState;
