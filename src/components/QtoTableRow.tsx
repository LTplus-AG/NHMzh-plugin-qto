import React from "react";
import {
  TableRow,
  TableCell,
  IconButton,
  Collapse,
  Box,
  Table,
  TableBody,
} from "@mui/material";
import {
  KeyboardArrowRight as ArrowRightIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from "@mui/icons-material";
import { CostItem } from "./types";
import { getColumnStyle, columnWidths } from "./styles";
import { tableStyle } from "./styles";
import QtoTableChildRow from "./QtoTableChildRow";

type CellStylesType = {
  text: React.CSSProperties;
  number: React.CSSProperties;
  currency: React.CSSProperties;
};

interface QtoTableRowProps {
  item: CostItem;
  expanded: boolean;
  onToggle: (code: string) => void;
  expandedRows: Record<string, boolean>;
  isMobile: boolean;
  renderNumber: (value: number | null | undefined, decimals?: number) => string;
  cellStyles: CellStylesType;
}

const QtoTableRow: React.FC<QtoTableRowProps> = ({
  item,
  expanded,
  onToggle,
  expandedRows,
  isMobile,
  renderNumber,
  cellStyles,
}) => {
  const hasChildren = item.children && item.children.length > 0;
  const depth = item.ebkp.length <= 3 ? 0 : item.ebkp.length <= 5 ? 1 : 2;

  const indentPadding = depth * 16;

  return (
    <>
      <TableRow
        hover
        onClick={() => hasChildren && onToggle(item.ebkp)}
        sx={{
          "&:hover": { cursor: hasChildren ? "pointer" : "default" },
          backgroundColor: depth === 0 ? "rgba(0, 0, 0, 0.04)" : "inherit",
        }}
      >
        <TableCell padding="none">
          <div style={{ paddingLeft: indentPadding }}>
            {hasChildren ? (
              <IconButton size="small" onClick={() => onToggle(item.ebkp)}>
                {expanded ? <ArrowDownIcon /> : <ArrowRightIcon />}
              </IconButton>
            ) : (
              <div style={{ width: 42 }} />
            )}
          </div>
        </TableCell>
        <TableCell>{item.ebkp}</TableCell>
        <TableCell style={cellStyles.text}>{item.bezeichnung}</TableCell>
        <TableCell align="right" style={cellStyles.number}>
          {item.menge !== undefined && renderNumber(item.menge)}
        </TableCell>
        <TableCell style={cellStyles.text}>{item.einheit}</TableCell>
        <TableCell align="right" style={cellStyles.number}>
          {item.kennwert !== undefined && renderNumber(item.kennwert)}
        </TableCell>
        <TableCell align="right" style={cellStyles.currency}>
          {item.chf !== undefined && renderNumber(item.chf)}
        </TableCell>
        <TableCell align="right" style={cellStyles.currency}>
          {item.totalChf !== undefined && renderNumber(item.totalChf)}
        </TableCell>
        <TableCell style={cellStyles.text}>{item.kommentar}</TableCell>
      </TableRow>

      {/* Render child rows */}
      {expanded &&
        hasChildren &&
        item.children.map((childItem) => (
          <QtoTableChildRow
            key={childItem.ebkp}
            item={childItem}
            expanded={expandedRows[childItem.ebkp] || false}
            onToggle={onToggle}
            expandedRows={expandedRows}
            isMobile={isMobile}
            renderNumber={renderNumber}
            cellStyles={cellStyles}
          />
        ))}
    </>
  );
};

export default QtoTableRow;
