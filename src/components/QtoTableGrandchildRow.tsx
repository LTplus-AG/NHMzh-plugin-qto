import React from "react";
import { TableRow, TableCell } from "@mui/material";
import { CostItem } from "./types";
import { getColumnStyle } from "./styles";

// Define a proper type for cellStyles instead of using any
interface CellStyles {
  grandchildRow?: React.CSSProperties;
  menge?: React.CSSProperties;
  standardBorder?: React.CSSProperties;
  kennwert?: React.CSSProperties;
  chf?: React.CSSProperties;
  totalChf?: React.CSSProperties;
  [key: string]: React.CSSProperties | undefined;
}

interface CostTableGrandchildRowProps {
  item: CostItem;
  isMobile: boolean;
  cellStyles: CellStyles;
  renderNumber: (
    value: number | null | undefined,
    decimals?: number
  ) => React.ReactElement | string;
}

const CostTableGrandchildRow = ({
  item,
  isMobile,
  cellStyles,
  renderNumber,
}: CostTableGrandchildRowProps) => {
  return (
    <TableRow hover sx={cellStyles.grandchildRow}>
      <TableCell sx={{ padding: isMobile ? "8px 4px" : undefined }}></TableCell>
      <TableCell
        component="th"
        scope="row"
        sx={{
          ...getColumnStyle("ebkp"),
          padding: isMobile ? "8px 4px" : undefined,
        }}
      >
        {item.ebkp}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("bezeichnung"),
          padding: isMobile ? "8px 4px" : undefined,
        }}
      >
        {item.bezeichnung}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("menge"),
          ...cellStyles.menge,
        }}
      >
        {item.menge !== null && item.menge !== undefined
          ? renderNumber(item.menge, 0)
          : ""}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("einheit"),
          ...cellStyles.standardBorder,
        }}
      >
        {item.einheit || ""}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("kennwert"),
          ...cellStyles.kennwert,
          ...cellStyles.standardBorder,
        }}
      >
        {item.kennwert !== null && item.kennwert !== undefined
          ? renderNumber(item.kennwert)
          : ""}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("chf"),
          ...cellStyles.chf,
          ...cellStyles.standardBorder,
        }}
      >
        {item.chf !== null && item.chf !== undefined
          ? renderNumber(item.chf)
          : ""}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("totalChf"),
          ...cellStyles.totalChf,
          ...cellStyles.standardBorder,
        }}
      >
        {item.totalChf !== null && item.totalChf !== undefined
          ? renderNumber(item.totalChf)
          : ""}
      </TableCell>
      <TableCell
        sx={{
          ...getColumnStyle("kommentar"),
          padding: isMobile ? "8px 4px" : undefined,
        }}
      >
        {item.kommentar || ""}
      </TableCell>
    </TableRow>
  );
};

export default CostTableGrandchildRow;
