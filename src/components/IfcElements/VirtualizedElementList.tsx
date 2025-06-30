import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Box,
  CircularProgress,
  Typography,
  TableSortLabel,
} from "@mui/material";
import ElementRow from "./ElementRow";
import { IFCElement } from "../../types/types";
import { EditedQuantity } from "./types";
import { ElementDisplayStatus } from "../IfcElementsList";
import { TABLE_COLUMNS, tableStyles, getColumnStyle } from "./tableConfig";

interface VirtualizedElementListProps {
  elements: IFCElement[];
  groupCode: string;
  expandedElements: string[];
  toggleExpandElement: (id: string) => void;
  editedElements: Record<string, EditedQuantity>;
  handleQuantityChange: (
    elementId: string,
    quantityKey: "area" | "length" | "count",
    originalValue: number | null | undefined,
    newValue: string
  ) => void;
  getElementDisplayStatus: (element: IFCElement) => ElementDisplayStatus;
  handleEditManualClick: (element: IFCElement) => void;
  openDeleteConfirm: (element: IFCElement) => void;
  maxHeight?: number;
}

type SortDirection = 'asc' | 'desc';
type SortColumn = 'type' | 'globalId' | 'kategorie' | 'ebene' | 'menge';

const VirtualizedElementList: React.FC<VirtualizedElementListProps> = ({
  elements,
  groupCode,
  expandedElements,
  toggleExpandElement,
  editedElements,
  handleQuantityChange,
  getElementDisplayStatus,
  handleEditManualClick,
  maxHeight = 500,
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const ITEMS_PER_PAGE = 50;
  const [loadedItemsCount, setLoadedItemsCount] = useState(
    Math.min(ITEMS_PER_PAGE, elements.length)
  );
  const [isLoading, setIsLoading] = useState(false);

  // Only virtualize if there are many elements (threshold: 20+)
  const shouldVirtualize = elements.length > 20;

  // Sort elements based on current sort configuration
  const sortedElements = useMemo(() => {
    if (!sortColumn) return elements;

    const sorted = [...elements].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'type':
          aValue = a.type_name || '';
          bValue = b.type_name || '';
          break;
        case 'globalId':
          aValue = a.global_id || '';
          bValue = b.global_id || '';
          break;
        case 'kategorie':
          aValue = a.classification_name || '';
          bValue = b.classification_name || '';
          break;
        case 'ebene':
          aValue = a.level || '';
          bValue = b.level || '';
          break;
        case 'menge':
          aValue = a.quantity?.value || 0;
          bValue = b.quantity?.value || 0;
          break;
        default:
          return 0;
      }

      // Handle numeric vs string comparison
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // String comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return sorted;
  }, [elements, sortColumn, sortDirection]);

  // Handle sort column click
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Load more items when user scrolls near the end
  const loadMoreItems = useCallback(async () => {
    if (isLoading || loadedItemsCount >= sortedElements.length) return;

    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newCount = Math.min(loadedItemsCount + ITEMS_PER_PAGE, sortedElements.length);
    setLoadedItemsCount(newCount);
    setIsLoading(false);
  }, [isLoading, loadedItemsCount, sortedElements.length]);

  // Reset loaded items when elements change
  useEffect(() => {
    setLoadedItemsCount(Math.min(ITEMS_PER_PAGE, sortedElements.length));
  }, [sortedElements]);

  // Get currently visible elements for virtualization
  const visibleElements = sortedElements.slice(0, loadedItemsCount);

  const rowVirtualizer = useVirtualizer({
    count: visibleElements.length + (isLoading ? 1 : 0),
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 80,
    overscan: 10,
    measureElement: (element) => element?.getBoundingClientRect().height,
  });

  // Render table headers with sorting
  const renderTableHeaders = () => (
    <TableHead>
      <TableRow>
        {TABLE_COLUMNS.map((column) => (
          <TableCell
            key={column.key}
            align={column.align}
            className={column.sortable ? 'sortable' : ''}
            sx={{
              ...tableStyles.headerCell,
              ...getColumnStyle(column),
            }}
          >
            {column.sortable ? (
              <TableSortLabel
                active={sortColumn === column.key}
                direction={sortColumn === column.key ? sortDirection : 'asc'}
                onClick={() => handleSort(column.key as SortColumn)}
              >
                {column.label}
              </TableSortLabel>
            ) : (
              column.label
            )}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );

  if (!shouldVirtualize) {
    // For smaller lists, render normally without virtualization
    return (
      <Box sx={tableStyles.container}>
        <Table size="small" sx={tableStyles.root}>
          {renderTableHeaders()}
          <TableBody>
            {visibleElements.map((element, elementIndex) => (
              <ElementRow
                key={element.global_id}
                element={element}
                groupCode={groupCode}
                elementIndex={elementIndex}
                isExpanded={expandedElements.includes(element.global_id)}
                toggleExpand={toggleExpandElement}
                editedElement={editedElements[element.global_id]}
                handleQuantityChange={handleQuantityChange}
                getElementDisplayStatus={getElementDisplayStatus}
                handleEditManualClick={handleEditManualClick}
              />
            ))}
          </TableBody>
        </Table>
        
        {/* Load More Button for non-virtualized lists */}
        {loadedItemsCount < sortedElements.length && (
          <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
            {isLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Typography
                variant="body2"
                sx={{
                  cursor: "pointer",
                  color: "primary.main",
                  "&:hover": { textDecoration: "underline" },
                  py: 1,
                  px: 2,
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "primary.main",
                }}
                onClick={loadMoreItems}
              >
                Load {Math.min(ITEMS_PER_PAGE, sortedElements.length - loadedItemsCount)} more elements
              </Typography>
            )}
          </Box>
        )}
      </Box>
    );
  }

  // Virtualized rendering for large lists
  return (
    <Box
      sx={{
        border: "1px solid rgba(0, 0, 0, 0.08)",
        borderRadius: 2,
        backgroundColor: "white",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      {/* Fixed Header */}
      <Box 
        sx={{
          ...tableStyles.container,
          overflowY: "hidden",
          overflowX: "hidden",
          borderBottom: "2px solid #ccc",
        }}
      >
        <Table size="small" sx={tableStyles.root}>
          {renderTableHeaders()}
        </Table>
      </Box>

      {/* Virtualized Content */}
      <Box
        ref={tableContainerRef}
        sx={{
          ...tableStyles.container,
          height: maxHeight,
          position: "relative",
        }}
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          if (scrollHeight - scrollTop - clientHeight < 200 && loadedItemsCount < sortedElements.length) {
            loadMoreItems();
          }
        }}
      >
        <Box
          sx={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const isLoaderRow = isLoading && virtualItem.index === visibleElements.length;
            
            if (isLoaderRow) {
              return (
                <Box
                  key="loading-indicator"
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "80px",
                  }}
                >
                  <CircularProgress size={24} />
                  <Typography variant="body2" sx={{ ml: 1, color: "text.secondary" }}>
                    Loading more elements...
                  </Typography>
                </Box>
              );
            }

            const element = visibleElements[virtualItem.index];
            const elementIndex = virtualItem.index;

            return (
              <Box
                key={element.global_id}
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <Table size="small" sx={tableStyles.root}>
                  <TableBody>
                    <ElementRow
                      element={element}
                      groupCode={groupCode}
                      elementIndex={elementIndex}
                      isExpanded={expandedElements.includes(element.global_id)}
                      toggleExpand={toggleExpandElement}
                      editedElement={editedElements[element.global_id]}
                      handleQuantityChange={handleQuantityChange}
                      getElementDisplayStatus={getElementDisplayStatus}
                      handleEditManualClick={handleEditManualClick}
                    />
                  </TableBody>
                </Table>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Progress indicator for remaining items */}
      {loadedItemsCount < sortedElements.length && !isLoading && (
        <Box
          sx={{
            p: 1,
            backgroundColor: "rgba(25, 118, 210, 0.04)",
            borderTop: "1px solid rgba(25, 118, 210, 0.12)",
            fontSize: "0.75rem",
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          Showing {loadedItemsCount} of {sortedElements.length} elements • Scroll down to load more
        </Box>
      )}
    </Box>
  );
};

export default VirtualizedElementList; 