import React, { useRef, useState, useEffect, useCallback } from "react";
import { Tooltip, TooltipProps } from "@mui/material";

interface TruncatedTextTooltipProps {
  title: string;
  children: React.ReactElement;
  placement?: TooltipProps["placement"];
  arrow?: boolean;
}

/**
 * A tooltip component that only shows when the text content is truncated.
 * Checks if the element's scroll width exceeds its client width.
 */
const TruncatedTextTooltip: React.FC<TruncatedTextTooltipProps> = ({
  title,
  children,
  placement = "top",
  arrow = true,
}) => {
  const [isOverflowed, setIsOverflowed] = useState(false);
  const textRef = useRef<HTMLElement>(null);

  const checkOverflow = useCallback(() => {
    const element = textRef.current;
    if (element) {
      // Check if content is wider than container
      const isOverflowing = element.scrollWidth > element.clientWidth;
      setIsOverflowed(isOverflowing);
    }
  }, []);

  useEffect(() => {
    // Check on mount and when content changes
    checkOverflow();

    // Re-check on window resize with debounce
    let timeoutId: number;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(checkOverflow, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [title, checkOverflow]); // Re-check when title (content) changes

  // Clone the child element and add the ref
  const childWithRef = React.cloneElement(children, {
    ref: textRef,
  } as any);

  // Only show tooltip if text is overflowed
  if (isOverflowed) {
    return (
      <Tooltip title={title} placement={placement} arrow={arrow}>
        {childWithRef}
      </Tooltip>
    );
  }

  // No tooltip if text fits
  return childWithRef;
};

export default TruncatedTextTooltip;

