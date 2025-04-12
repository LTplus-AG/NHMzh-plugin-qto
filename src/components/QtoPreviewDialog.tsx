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
  Box,
  Chip,
} from "@mui/material";

// Type colors for the legend - more subtle palette
const TYPE_COLORS = {
  typeName: "#81c784", // Lighter green
  instanceName: "#90caf9", // Lighter blue
  ifcClass: "#ffcc80", // Lighter orange
};

// Interface for the elements passed from MainPage
interface IfcElement {
  id: string; // Needed to check against editedElements keys
  type_name?: string | null;
  name?: string | null;
  type?: string | null;
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
  nameSource: "typeName" | "instanceName" | "ifcClass" | "unknown";
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
      {
        totalCount: number;
        editedCount: number;
        nameSource: "typeName" | "instanceName" | "ifcClass" | "unknown";
      }
    > = {};

    ifcElements.forEach((element) => {
      // Implement fallback hierarchy for type name:
      // 1. Use type_name if available
      // 2. Fallback to element name if type_name is missing
      // 3. Fallback to element type (IFC class) if both are missing
      // 4. Last resort - use "Unbekannter Typ" only if all above are missing
      let typeName = element.type_name;
      let nameSource: "typeName" | "instanceName" | "ifcClass" | "unknown" =
        "typeName";

      if (!typeName || typeName === "null" || typeName === "") {
        // Try to use element name as fallback
        if (element.name && element.name !== "null" && element.name !== "") {
          typeName = element.name;
          nameSource = "instanceName";
        }
        // If name also missing, try to use element type
        else if (
          element.type &&
          element.type !== "null" &&
          element.type !== ""
        ) {
          typeName = element.type;
          nameSource = "ifcClass";
        }
        // Last resort fallback
        else {
          typeName = "Unbekannter Typ";
          nameSource = "unknown";
        }
      }

      // Initialize the entry for this typeName if it doesn't exist
      if (!summaryMap[typeName]) {
        summaryMap[typeName] = {
          totalCount: 0,
          editedCount: 0,
          nameSource: nameSource,
        };
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
        ([typeName, info]): TypeSummary => ({
          typeName,
          nameSource: info.nameSource,
          totalCount: info.totalCount,
          editedCount: info.editedCount,
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
      <DialogTitle
        id="preview-dialog-title"
        sx={{
          pb: 1,
          pr: "140px", // Make room for the chips
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography variant="h6" component="div" sx={{ fontWeight: "medium" }}>
          {selectedProject}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {selectedFileName}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {/* Element count chips at top right */}
        <Box
          sx={{
            position: "absolute",
            top: "16px",
            right: "24px",
            display: "flex",
            gap: 2,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Chip
              label={totalElements.toLocaleString()}
              color="primary"
              sx={{
                height: "auto",
                minWidth: "56px",
                borderRadius: "20px",
                "& .MuiChip-label": {
                  fontSize: "1rem",
                  fontWeight: "bold",
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                },
              }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              Elemente
            </Typography>
          </Box>

          <Box sx={{ textAlign: "center" }}>
            <Chip
              label={totalEditedElements.toLocaleString()}
              color={totalEditedElements > 0 ? "secondary" : "default"}
              sx={{
                height: "auto",
                minWidth: "56px",
                borderRadius: "20px",
                "& .MuiChip-label": {
                  fontSize: "1rem",
                  fontWeight: "bold",
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                },
              }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
            >
              Bearbeitet
            </Typography>
          </Box>
        </Box>

        {/* Brief instruction */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 3, fontSize: "0.85rem" }}
        >
          Nach dem Senden werden die Elemente für andere Plugins freigegeben.
        </Typography>

        {/* Display the summary table by type */}
        <Typography variant="h6" gutterBottom>
          Übersicht nach Typ
        </Typography>

        <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
          <Table stickyHeader size="small" aria-label="summary table">
            <TableHead>
              <TableRow>
                <TableCell>Element Bezeichnung</TableCell>
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
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        {/* Only show color indicator if multiple name sources are used */}
                        {(summaryData.some(
                          (s) => s.nameSource === "instanceName"
                        ) ||
                          summaryData.some(
                            (s) => s.nameSource === "ifcClass"
                          )) &&
                          summary.nameSource !== "unknown" && (
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                bgcolor: TYPE_COLORS[summary.nameSource],
                                flexShrink: 0,
                              }}
                            />
                          )}
                        <Typography
                          variant="body2"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {summary.typeName}
                        </Typography>
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

        {/* Only show legend if there are elements AND we have mixed name sources */}
        {summaryData.length > 0 &&
          (summaryData.some((s) => s.nameSource === "instanceName") ||
            summaryData.some((s) => s.nameSource === "ifcClass")) && (
            <>
              {/* Determine which types of sources are used */}
              {(() => {
                const usedSources = {
                  typeName: summaryData.some(
                    (s) => s.nameSource === "typeName"
                  ),
                  instanceName: summaryData.some(
                    (s) => s.nameSource === "instanceName"
                  ),
                  ifcClass: summaryData.some(
                    (s) => s.nameSource === "ifcClass"
                  ),
                };

                return (
                  <Box
                    sx={{
                      mt: 1,
                      mb: 1,
                      color: "text.secondary",
                      fontSize: "0.75rem",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      Bei fehlenden Typ-Informationen werden automatisch
                      Element-Namen oder IFC-Klassen verwendet.
                    </Typography>

                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                      {usedSources.typeName && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                          }}
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: TYPE_COLORS.typeName,
                            }}
                          />
                          <Typography variant="caption">Typ Name</Typography>
                        </Box>
                      )}

                      {usedSources.instanceName && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                          }}
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: TYPE_COLORS.instanceName,
                            }}
                          />
                          <Typography variant="caption">
                            Element Name
                          </Typography>
                        </Box>
                      )}

                      {usedSources.ifcClass && (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.8,
                          }}
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: TYPE_COLORS.ifcClass,
                            }}
                          />
                          <Typography variant="caption">IFC Klasse</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })()}
            </>
          )}
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
          {isSending ? "Senden..." : "Bestätigen und Freigeben"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
