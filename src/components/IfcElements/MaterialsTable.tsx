import React from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { IFCElement } from "../../types/types";
import { isZeroQuantity, getZeroQuantityStyles } from "../../utils/zeroQuantityHighlight";

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
  // Function to get materials from either materials array or material_volumes object
  const getElementMaterials = (element: IFCElement) => {
    return element.materials || [];
  };

  // Format decimal number to display with 3 decimal places
  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return "-";
    return num.toFixed(3);
  };

  // Format percentage with proper precision
  const formatPercentage = (fraction: number | null | undefined) => {
    // Check for both null and undefined
    if (fraction === null || fraction === undefined) return "-";

    // For grouped elements, we want to ensure percentages add up to 100%
    if (element.groupedElements && element.groupedElements > 1) {
      return `${(fraction * 100).toFixed(1)}%`;
    }

    // For regular elements, use standard formatting
    return `${(fraction * 100).toFixed(1)}%`;
  };

  let materials = getElementMaterials(element);

  // --- Auto adjust material volumes based on edited quantity ---
  if (
    editedElement?.newQuantity?.value !== undefined &&
    editedElement.originalQuantity?.value !== undefined &&
    typeof editedElement.newQuantity.value === "number" &&
    typeof editedElement.originalQuantity.value === "number" &&
    editedElement.originalQuantity.value !== 0 &&
    editedElement.newQuantity.type === editedElement.originalQuantity.type &&
    materials.length > 0
  ) {
    const ratio = editedElement.newQuantity.value / editedElement.originalQuantity.value;
    if (isFinite(ratio)) {
      materials = materials.map((mat) => {
        if (typeof mat.volume === "number") {
          return { ...mat, volume: mat.volume * ratio };
        }
        return mat;
      });
    }
  }

  return (
    <>
      {element.groupedElements && element.groupedElements > 1 && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "rgba(0, 0, 0, 0.6)",
            marginBottom: "8px",
            fontStyle: "italic",
          }}
        >
          {element.hasPropertyDifferences ? (
            <>
              <span style={{ color: "orange" }}>⚠</span> Materialien von{" "}
              {element.groupedElements} Elementen ({element.type}, Ebene:{" "}
              {element.level}) zusammengefasst. Eigenschaften nicht einheitlich.
            </>
          ) : (
            <>
              Materialien von {element.groupedElements} Elementen (
              {element.type}, Ebene: {element.level}) zusammengefasst
            </>
          )}
        </div>
      )}
      <Table size="small" aria-label="materials">
        <TableHead>
          <TableRow>
            <TableCell>Material</TableCell>
            <TableCell>
              Anteil (%)
              {element.groupedElements && element.groupedElements > 1 && (
                <Tooltip
                  title="Die Anteile werden basierend auf den Materialvolumen neu berechnet und summieren sich immer zu 100%"
                  placement="top"
                  arrow
                >
                  <InfoIcon
                    fontSize="small"
                    style={{
                      fontSize: "14px",
                      marginLeft: "4px",
                      verticalAlign: "middle",
                      color: "rgba(0, 0, 0, 0.54)",
                    }}
                  />
                </Tooltip>
              )}
            </TableCell>
            <TableCell>Volumen (m³)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {materials.map((material, materialIndex) => {
            const hasZeroVolume = isZeroQuantity(material.volume);
            return (
              <TableRow 
                key={`material-${uniqueKey}-${materialIndex}`}
                sx={getZeroQuantityStyles(hasZeroVolume)}
              >
                <TableCell component="th" scope="row">
                  {material.name}
                </TableCell>
                <TableCell>
                  {material.fraction !== undefined
                    ? formatPercentage(material.fraction)
                    : "-"}
                </TableCell>
                <TableCell sx={{
                  fontWeight: hasZeroVolume ? 'bold' : 'normal',
                  color: hasZeroVolume ? 'warning.main' : 'inherit'
                }}>
                  {material.volume !== undefined
                    ? formatNumber(material.volume)
                    : "-"}
                </TableCell>
              </TableRow>
            );
          })}
          {materials.length === 0 && (
            <TableRow>
              <TableCell colSpan={3}>
                Keine Materialinformationen verfügbar
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
};

export default MaterialsTable;
