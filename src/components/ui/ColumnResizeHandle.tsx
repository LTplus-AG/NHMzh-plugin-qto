import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";

interface ColumnResizeHandleProps {
  columnKey: string;
  onResize: (columnKey: string, width: number) => void;
  currentWidth: string | number;
  minWidth?: number;
}

const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
  columnKey,
  onResize,
  currentWidth,
  minWidth = 50,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      setIsResizing(true);
      startXRef.current = e.clientX;
      // Parse currentWidth if it's a string like "150px"
      startWidthRef.current = typeof currentWidth === 'string' 
        ? parseFloat(currentWidth) 
        : currentWidth;

      // Add class to body to prevent text selection during resize
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [currentWidth]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, startWidthRef.current + deltaX);
      onResize(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, columnKey, onResize, minWidth]);

  return (
    <Box
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        position: "absolute",
        right: -2,
        top: 0,
        bottom: 0,
        width: "8px",
        cursor: "col-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        "&:hover": {
          backgroundColor: "rgba(0, 0, 0, 0.04)",
        },
        backgroundColor: isResizing ? "rgba(0, 0, 0, 0.06)" : "transparent",
        transition: "background-color 0.2s",
        "&::before": {
          content: '""',
          position: "absolute",
          right: "50%",
          top: "20%",
          bottom: "20%",
          width: "1px",
          backgroundColor: isHovered || isResizing ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.08)",
          opacity: isHovered || isResizing ? 1 : 0,
          transition: "opacity 0.2s",
        },
      }}
    >
    </Box>
  );
};

export default ColumnResizeHandle;

