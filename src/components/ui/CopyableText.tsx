import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import logger from '../../utils/logger';

interface CopyableTextProps {
  text: string;
  displayText?: string;
  maxWidth?: string | number;
  fontSize?: string;
  tooltip?: string;
  variant?: 'chip' | 'text';
  showFullText?: boolean;
}

const CopyableText: React.FC<CopyableTextProps> = ({
  text,
  displayText,
  maxWidth = "110px",
  fontSize = "0.75rem",
  tooltip = "Global ID kopieren",
  variant = 'chip',
  showFullText = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      logger.error("Failed to copy text: ", err);
    }
  };

  // Smart truncation for Global IDs
  const getDisplayText = () => {
    if (displayText) return displayText;
    if (showFullText) return text;
    if (text.length > 10) {
      return `${text.substring(0, 6)}...${text.substring(text.length - 2)}`;
    }
    return text;
  };

  if (variant === 'chip') {
    return (
      <>
        <Tooltip 
          title={tooltip}
          placement="top"
          arrow
        >
          <Chip
            label={getDisplayText()}
            size="small"
            onClick={handleCopy}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            icon={
              copied ? (
                <CheckIcon sx={{ fontSize: "0.8rem !important" }} />
              ) : isHovered ? (
                <ContentCopyIcon sx={{ fontSize: "0.8rem !important" }} />
              ) : undefined
            }
            sx={{
              maxWidth: showFullText ? "none" : maxWidth,
              height: "24px",
              fontSize: fontSize,
              fontFamily: "monospace",
              backgroundColor: copied 
                ? "rgba(46, 125, 50, 0.08)" 
                : "rgba(0, 0, 0, 0.06)",
              color: copied ? "success.main" : "text.secondary",
              cursor: "pointer",
              transition: "all 0.2s ease-in-out",
              border: `1px solid ${copied ? "rgba(46, 125, 50, 0.2)" : "transparent"}`,
              "&:hover": {
                backgroundColor: copied 
                  ? "rgba(46, 125, 50, 0.12)" 
                  : "rgba(25, 118, 210, 0.08)",
                color: copied ? "success.main" : "primary.main",
                border: `1px solid ${copied ? "rgba(46, 125, 50, 0.3)" : "rgba(25, 118, 210, 0.2)"}`,
                transform: "translateY(-1px)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              },
              "&:active": {
                transform: "translateY(0px)",
              },
              "& .MuiChip-label": {
                px: 1,
                overflow: "hidden",
                textOverflow: showFullText ? "clip" : "ellipsis",
                whiteSpace: "nowrap",
              },
              "& .MuiChip-icon": {
                ml: "4px",
                mr: "-2px",
              },
            }}
          />
        </Tooltip>
      </>
    );
  }

  // Text variant (fallback)
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          maxWidth: showFullText ? "none" : maxWidth,
          minWidth: "90px",
        }}
      >
        <Tooltip title={tooltip}>
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              fontSize,
              fontFamily: "monospace",
              color: "text.secondary",
              cursor: "pointer",
              overflow: "hidden",
              textOverflow: showFullText ? "clip" : "ellipsis",
              whiteSpace: "nowrap",
              "&:hover": {
                color: "primary.main",
                backgroundColor: "rgba(25, 118, 210, 0.04)",
              },
              padding: "2px 4px",
              borderRadius: "4px",
              transition: "all 0.2s ease",
            }}
            onClick={handleCopy}
          >
            {getDisplayText()}
          </Typography>
        </Tooltip>
        <Tooltip title={copied ? "Kopiert!" : tooltip}>
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{
              ml: 0.5,
              padding: "2px",
              color: copied ? "success.main" : "action.secondary",
              "&:hover": {
                backgroundColor: copied
                  ? "rgba(46, 125, 50, 0.04)"
                  : "rgba(0, 0, 0, 0.04)",
              },
              transition: "all 0.2s ease",
            }}
          >
            {copied ? (
              <CheckIcon fontSize="inherit" />
            ) : (
              <ContentCopyIcon fontSize="inherit" />
            )}
          </IconButton>
        </Tooltip>
      </Box>
    </>
  );
};

export default CopyableText; 