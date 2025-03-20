import React from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import { IFCElement } from "../../types/types";

interface MaterialsTableProps {
  element: IFCElement;
  uniqueKey: string;
}

const MaterialsTable: React.FC<MaterialsTableProps> = ({
  element,
  uniqueKey,
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

  const materials = getElementMaterials(element);

  return (
    <Table size="small" aria-label="materials">
      <TableHead>
        <TableRow>
          <TableCell>Material</TableCell>
          <TableCell>Anteil (%)</TableCell>
          <TableCell>Volumen (m³)</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {materials.map((material, materialIndex) => (
          <TableRow key={`material-${uniqueKey}-${materialIndex}`}>
            <TableCell component="th" scope="row">
              {material.name}
            </TableCell>
            <TableCell>
              {material.fraction !== undefined
                ? `${(material.fraction * 100).toFixed(1)}%`
                : "-"}
            </TableCell>
            <TableCell>
              {material.volume !== undefined
                ? formatNumber(material.volume)
                : "-"}
            </TableCell>
          </TableRow>
        ))}
        {materials.length === 0 && (
          <TableRow>
            <TableCell colSpan={3}>
              Keine Materialinformationen verfügbar
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default MaterialsTable;
