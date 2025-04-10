import React, { useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

// Interface for the elements passed from MainPage
interface IfcElement {
  id: string; // Needed to check against editedElements keys
  type_name?: string | null;
}

// Interface matching the structure of the editedElements map from useElementEditing
interface EditedQuantity {
  originalArea?: number | null;
  newArea?: number | string | null;
  // Add other properties if they exist in the map
}

// Interface for the props of this dialog component
interface QtoPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: () => void;
  selectedProject: string;
  selectedFileName: string | undefined;
  ifcElements: IfcElement[];
  editedElements: Record<string, EditedQuantity>; // Receive the map of edited elements
  isSending: boolean;
}

// Interface for the calculated summary data structure
interface TypeSummary {
  typeName: string;
  totalCount: number;
  editedCount: number;
}

export const QtoPreviewDialog: React.FC<QtoPreviewDialogProps> = ({
  open,
  onClose,
  onSend,
  selectedProject,
  selectedFileName,
  ifcElements,
  editedElements,
  isSending,
}) => {
  // Calculate the summary data using useMemo for efficiency
  const summaryData: TypeSummary[] = useMemo(() => {
    const summaryMap: Record<
      string,
      { totalCount: number; editedCount: number }
    > = {};

    ifcElements.forEach((element) => {
      const typeName = element.type_name || "Unbekannter Typ"; // Use a fallback for missing type names

      // Initialize the entry for this typeName if it doesn't exist
      if (!summaryMap[typeName]) {
        summaryMap[typeName] = { totalCount: 0, editedCount: 0 };
      }

      // Increment the total count for this typeName
      summaryMap[typeName].totalCount++;

      // Increment the edited count if the element's ID is a key in the editedElements map
      if (editedElements.hasOwnProperty(element.id)) {
        summaryMap[typeName].editedCount++;
      }
    });

    // Convert the map into an array of TypeSummary objects and sort alphabetically
    return Object.entries(summaryMap)
      .map(
        ([typeName, counts]): TypeSummary => ({
          typeName,
          totalCount: counts.totalCount,
          editedCount: counts.editedCount,
        })
      )
      .sort((a, b) => a.typeName.localeCompare(b.typeName));
  }, [ifcElements, editedElements]); // Dependencies for recalculation

  // Calculate overall totals
  const totalElements = ifcElements.length;
  const totalEditedElements = Object.keys(editedElements).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="preview-dialog-title"
      aria-describedby="preview-dialog-description"
      maxWidth="sm" // Adjusted width for the summary view
      fullWidth
    >
      <DialogTitle id="preview-dialog-title">
        Zusammenfassung & Senden:
      </DialogTitle>
      <DialogContent>
        {/* Display overall project/file info and totals */}
        <DialogContentText
          component="div"
          id="preview-dialog-description"
          sx={{ mb: 2 }}
        >
          <Typography variant="body1" gutterBottom>
            Bitte vor dem Senden die IFC Elemente überprüfen und bei Bedarf die ermittelten Mengen bearbeiten:
          </Typography>
          <Typography variant="body2">
            Projekt: <strong>{selectedProject}</strong>
          </Typography>
          <Typography variant="body2">
            Datei: <strong>{selectedFileName}</strong>
          </Typography>
          <Typography variant="body2">
            Elemente Gesamt: <strong>{totalElements}</strong>
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Elemente Bearbeitet: <strong>{totalEditedElements}</strong>
          </Typography>
        </DialogContentText>

        {/* Display the summary table by type */}
        <Typography variant="h6" gutterBottom>
          Übersicht nach Typ
        </Typography>
        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small" aria-label="summary table">
            <TableHead>
              <TableRow>
                <TableCell>Typ Name</TableCell>
                <TableCell align="right">Anzahl Gesamt</TableCell>
                <TableCell align="right">Anzahl Bearbeitet</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Conditional rendering for empty state vs summary rows */}
              {summaryData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    Keine Elemente zum Anzeigen.
                  </TableCell>
                </TableRow>
              ) : (
                summaryData.map(
                  (
                    summary: TypeSummary // Explicitly type summary
                  ) => (
                    <TableRow
                      key={summary.typeName} // Use unique typeName for the key
                      sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                    >
                      <TableCell component="th" scope="row">
                        {summary.typeName}
                      </TableCell>
                      <TableCell align="right">{summary.totalCount}</TableCell>
                      <TableCell align="right">{summary.editedCount}</TableCell>
                    </TableRow>
                  )
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Abbrechen
        </Button>
        <Button
          onClick={onSend}
          color="primary"
          disabled={isSending || totalElements === 0} // Disable send if sending or no elements
          autoFocus
        >
          {isSending ? "Senden..." : "Senden"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
