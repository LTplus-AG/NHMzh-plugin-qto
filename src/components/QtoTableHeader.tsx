import { TableHead, TableRow, TableCell } from "@mui/material";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import { getColumnStyle } from "./styles";

// Define a proper type for cellStyles
interface CellStyles {
  header?: React.CSSProperties;
  menge?: React.CSSProperties;
  kennwert?: React.CSSProperties;
  chf?: React.CSSProperties;
  totalChf?: React.CSSProperties;
  [key: string]: React.CSSProperties | undefined;
}

interface TableHeaderProps {
  isMobile: boolean;
  cellStyles: CellStyles;
}

const TableHeader = ({ isMobile, cellStyles }: TableHeaderProps) => {
  return (
    <TableHead>
      <TableRow>
        <TableCell
          sx={{
            ...getColumnStyle("expandIcon"),
            ...cellStyles.header,
          }}
        ></TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("ebkp"),
            ...cellStyles.header,
          }}
        >
          eBKP
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("bezeichnung"),
            ...cellStyles.header,
          }}
        >
          Bezeichnung
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("menge"),
            ...cellStyles.menge,
          }}
        >
          Menge
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("einheit"),
            ...cellStyles.header,
          }}
        >
          Einheit
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("kennwert"),
            ...cellStyles.header,
            ...cellStyles.kennwert,
          }}
        >
          <span>Kennwert</span>
          {!isMobile && (
            <ArrowRightAltIcon
              fontSize="small"
              sx={{ verticalAlign: "middle", ml: 1 }}
            />
          )}
          <span
            style={{
              fontSize: "0.75rem",
              color: "#666",
              marginLeft: "4px",
            }}
          >
            (Eingabe)
          </span>
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("chf"),
            ...cellStyles.header,
            ...cellStyles.chf,
          }}
        >
          <span>CHF</span>
          {!isMobile && (
            <ArrowRightAltIcon
              fontSize="small"
              sx={{ verticalAlign: "middle", ml: 1 }}
            />
          )}
          <span
            style={{
              fontSize: "0.75rem",
              color: "#666",
              marginLeft: "4px",
            }}
          >
            (Berechnet)
          </span>
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("totalChf"),
            ...cellStyles.header,
            ...cellStyles.totalChf,
          }}
        >
          Total CHF
        </TableCell>
        <TableCell
          sx={{
            ...getColumnStyle("kommentar"),
            ...cellStyles.header,
          }}
        >
          Kommentar
        </TableCell>
      </TableRow>
    </TableHead>
  );
};

export default TableHeader;
