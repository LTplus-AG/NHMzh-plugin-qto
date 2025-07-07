import { SxProps, Theme } from '@mui/material/styles';
import { quantityConfig } from '../types/types';

// Check if a quantity value is zero or effectively zero
export const isZeroQuantity = (value: number | null | undefined): boolean => {
  if (value === null || value === undefined) return true;
  return Math.abs(value) < 0.001; // Consider values less than 0.001 as zero
};

// Get the styling for zero quantity highlighting
export const getZeroQuantityStyles = (
  hasZeroQuantity: boolean,
  baseStyles?: SxProps<Theme>
): SxProps<Theme> => {
  if (!hasZeroQuantity) return baseStyles || {};

  // Extract base styles but override background color
  const { backgroundColor: _, ...otherBaseStyles } = baseStyles as any || {};

  return {
    ...otherBaseStyles,
    backgroundColor: 'rgba(255, 152, 0, 0.06) !important', // Force override with !important
    position: 'relative',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0, // Start from the left edge
      right: 0,
      bottom: 0,
      background: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255, 152, 0, 0.03) 8px, rgba(255, 152, 0, 0.03) 16px)',
      pointerEvents: 'none',
      zIndex: 0,
    },
    '&:hover': {
      backgroundColor: 'rgba(255, 152, 0, 0.10) !important',
    },
    '& > *': {
      position: 'relative',
      zIndex: 1, // Ensure content is above the pattern
    },
    transition: 'all 0.2s ease-in-out',
  };
};

// Get the styling for zero quantity cells (for specific cells within a row)
export const getZeroQuantityCellStyles = (
  hasZeroQuantity: boolean,
  baseStyles?: SxProps<Theme>
): SxProps<Theme> => {
  if (!hasZeroQuantity) return baseStyles || {};

  return {
    ...baseStyles,
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    borderRadius: '4px',
    border: '1px solid rgba(255, 152, 0, 0.3)',
    position: 'relative',
    '&::after': {
      content: '"⚠"',
      position: 'absolute',
      top: '2px',
      right: '4px',
      fontSize: '10px',
      color: 'rgba(255, 152, 0, 0.8)',
      fontWeight: 'bold',
    },
  };
};

// Get tooltip text for zero quantity warning
export const getZeroQuantityTooltip = (elementType?: string, isGrouped?: boolean): string => {
  const baseText = isGrouped 
    ? 'Mindestens ein Element in der Gruppe hat keine Mengen (0 m², 0 m, 0 m³)'
    : 'Keine Mengen vorhanden (0 m², 0 m, 0 m³)';
  if (elementType) {
    return `${baseText} - ${elementType}`;
  }
  return baseText;
};

// Check if an element/item has zero quantity across different quantity types
export const hasZeroQuantityInAnyType = (item: {
  quantity?: number | null;
  area?: number | null;
  length?: number | null;
  volume?: number | null;
  count?: number | null;
  hasZeroQuantityInGroup?: boolean; // For grouped elements
  groupedElements?: number; // Indicates if this is a grouped element
  type?: string; // Element type to determine which quantity to check
}): boolean => {
  // For grouped elements, check if any element in the group has zero quantities
  if (item.groupedElements && item.groupedElements > 1 && item.hasZeroQuantityInGroup) {
    return true;
  }
  
  // Use the imported quantityConfig
  
  const quantities = [
    item.quantity,
    item.area,
    item.length,
    item.volume,
    item.count,
  ];
  
  // If all quantities are null/undefined, consider it zero
  const hasAnyQuantity = quantities.some(q => q !== null && q !== undefined);
  if (!hasAnyQuantity) return true;
  
  // If we have element type information, check only the relevant quantity
  if (item.type && quantityConfig[item.type]) {
    const config = quantityConfig[item.type];
    const relevantQuantity = config.key === "area" ? item.area : 
                           config.key === "length" ? item.length : 
                           item.volume; // fallback to volume for count types
    
    return relevantQuantity === null || relevantQuantity === undefined || isZeroQuantity(relevantQuantity);
  }
  
  // For unknown types or when type is not provided, check if all defined quantities are zero (original behavior)
  return quantities.every(q => q === null || q === undefined || isZeroQuantity(q));
}; 