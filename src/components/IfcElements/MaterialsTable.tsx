import React from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
  TableContainer,
  Paper,
  Alert,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import InfoIcon from "@mui/icons-material/Info";
import { IFCElement } from "../../types/types";
import { isZeroQuantity, getZeroQuantityStyles } from "../../utils/zeroQuantityHighlight";
import { getVolumeValue } from "../../utils/volumeHelpers";

import { EditedQuantity } from "./types";

interface MaterialsTableProps {
  element: IFCElement;
  uniqueKey: string;
  editedElement?: EditedQuantity;
}

const MaterialsTable: React.FC<MaterialsTableProps> = ({
  element,
  uniqueKey,
  editedElement,
}) => {
  // Number formatters for consistent formatting
  const formatVolume = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return "-";
    return num.toFixed(3);
  };

  const formatPercentage = (fraction: number | null | undefined): string => {
    if (fraction === null || fraction === undefined) return "-";
    return `${(fraction * 100).toFixed(1)}%`;
  };

  const calculateAdjustedVolume = (): number | null => {
    const materialsVolume = getVolumeValue(element.volume ?? element.original_volume ?? null);
    if (editedElement?.newQuantity && editedElement.newQuantity.value !== null) {
      const newVal = editedElement.newQuantity.value;
      const qType = editedElement.newQuantity.type;

      if (qType === "volume") {
        return typeof newVal === "number" ? newVal : materialsVolume;
      }

      if (qType === "area") {
        const baseArea = element.original_area ?? element.area;
        if (materialsVolume !== null && baseArea && baseArea > 0 && typeof newVal === "number") {
          return materialsVolume * (newVal / baseArea);
        }
      }

      if (qType === "length") {
        const baseLength = element.original_length ?? element.length;
        if (
          materialsVolume !== null &&
          baseLength &&
          baseLength > 0 &&
          typeof newVal === "number"
        ) {
          return materialsVolume * (newVal / baseLength);
        }
      }
    }

    return materialsVolume;
  };

  const adjustedVolume = calculateAdjustedVolume();

  const materials = (element.materials || []).map((mat) => {
    if (
      adjustedVolume !== null &&
      mat.fraction !== undefined &&
      typeof mat.fraction === "number"
    ) {
      return { ...mat, volume: mat.fraction * adjustedVolume };
    }
    return mat;
  });

  return (
    <>
      {element.groupedElements && element.groupedElements > 1 && (
        <Alert
          severity={element.hasPropertyDifferences ? "warning" : "info"}
          variant="outlined"
          sx={{ mb: 1 }}
        >
          <Typography variant="body2">
            {element.hasPropertyDifferences ? (
              <>
                Materialien von {element.groupedElements} Elementen ({element.type}, Ebene: {element.level}) zusammengefasst. Eigenschaften nicht einheitlich.
              </>
            ) : (
              <>
                Materialien von {element.groupedElements} Elementen ({element.type}, Ebene: {element.level}) zusammengefasst
              </>
            )}
          </Typography>
        </Alert>
      )}
      <TableContainer 
        component={Paper} 
        variant="outlined" 
        sx={{ 
          borderRadius: 1,
          display: 'inline-block',
          width: 180 + 100 + 110, // Exact table width
          overflow: 'hidden',
        }}
      >
        <Table 
          size="small" 
          aria-label="materials"
          sx={{
            tableLayout: 'fixed',
            width: 180 + 100 + 110, // material + percent + volume
            '& .MuiTableCell-root': {
              py: 1,
            },
          }}
        >
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 180 }}>Material</TableCell>
              <TableCell 
                sx={{ 
                  fontWeight: 600, 
                  textAlign: 'right',
                  width: 100,
                  whiteSpace: 'nowrap',
                }}
              >
                Anteil (%)
                {element.groupedElements && element.groupedElements > 1 && (
                  <Tooltip
                    title="Die Anteile werden basierend auf den Materialvolumen neu berechnet und summieren sich immer zu 100%"
                    placement="top"
                    arrow
                  >
                    <InfoIcon
                      fontSize="small"
                      sx={{
                        fontSize: 14,
                        ml: 0.5,
                        verticalAlign: 'middle',
                        color: 'text.secondary',
                      }}
                    />
                  </Tooltip>
                )}
              </TableCell>
              <TableCell 
                sx={{ 
                  fontWeight: 600, 
                  textAlign: 'right',
                  width: 110,
                  whiteSpace: 'nowrap',
                }}
              >
                Volumen (m³)
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.map((material, materialIndex) => {
              const hasZeroVolume = isZeroQuantity(material.volume);
              const isOddRow = materials.length > 1 && materialIndex % 2 === 0; // First row (index 0) is odd, but only if more than one row
              const baseRowStyles = isOddRow
                ? {
                    backgroundColor: (theme: any) => alpha(theme.palette.action.hover, 0.03),
                  }
                : {};
              
              return (
                <TableRow
                  key={`material-${uniqueKey}-${materialIndex}`}
                  sx={{
                    ...baseRowStyles,
                    ...getZeroQuantityStyles(hasZeroVolume, baseRowStyles),
                  }}
                >
                  <TableCell 
                    component="th" 
                    scope="row"
                    sx={{ 
                      width: 180,
                      maxWidth: 180,
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      hyphens: 'auto',
                    }}
                  >
                    {material.name}
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontFeatureSettings: '"tnum"',
                      width: 100,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {material.fraction !== undefined ? formatPercentage(material.fraction) : "-"}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontVariantNumeric: 'tabular-nums',
                      fontFeatureSettings: '"tnum"',
                      fontWeight: hasZeroVolume ? "bold" : "normal",
                      color: hasZeroVolume ? "warning.main" : "inherit",
                      width: 110,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {material.volume !== undefined ? formatVolume(material.volume) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
            {materials.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} sx={{ textAlign: 'center', py: 2 }}>
                  Keine Materialinformationen verfügbar
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default MaterialsTable;
