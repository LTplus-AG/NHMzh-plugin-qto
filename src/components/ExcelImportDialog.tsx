import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  AlertTitle,
  Chip,
  LinearProgress,
  IconButton,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Fade,
  Collapse
} from '@mui/material';
import {
  CloudUpload,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Info,
  Close,
  FileDownload,
  Refresh,
  ExpandMore,
  ExpandLess,
  TableView
} from '@mui/icons-material';
import { ExcelService, ExcelImportResult, ExcelImportData } from '../utils/excelService';
import { IFCElement } from '../types/types';
import logger from '../utils/logger';

interface Props {
  open: boolean;
  onClose: () => void;
  onImportComplete: (importedData: ExcelImportData[]) => void;
  existingElements: IFCElement[];
}

type ImportStep = 'file-selection' | 'processing' | 'preview' | 'complete';

const ExcelImportDialog: React.FC<Props> = ({
  open,
  onClose,
  onImportComplete,
  existingElements
}) => {
  const [activeStep, setActiveStep] = useState<ImportStep>('file-selection');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setActiveStep('processing');
      processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    try {
      const result = await ExcelService.importFromExcel(file);
      setImportResult(result);
      
      if (result.success && result.data.length > 0) {
        setActiveStep('preview');
      } else {
        setActiveStep('file-selection');
      }
    } catch (error) {
      logger.error('Import processing failed:', error);
      alert('Fehler beim Verarbeiten der Excel-Datei');
    } finally {
      // setIsProcessing(false); // This line was not in the edit_specification, so it's removed.
    }
  };

  const handleImportConfirm = () => {
    if (!importResult?.data) return;

    onImportComplete(importResult.data);
    setActiveStep('complete');
    timeoutRef.current = setTimeout(() => {
      handleClose();
    }, 1500);
  };

  const handleClose = () => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    setActiveStep('file-selection');
    setSelectedFile(null);
    setImportResult(null);
    setShowErrors(false);
    setShowWarnings(false);
    onClose();
  };

  const downloadTemplate = async () => {
    // Use existing elements to create template
    await ExcelService.generateTemplate(existingElements);
  };

  const getNewElements = () => {
    if (!importResult?.data) return [];
    
    const existingGuids = new Set(existingElements.map(el => el.global_id));
    return importResult.data.filter(item => !existingGuids.has(item.global_id));
  };

  const getUpdatedElements = () => {
    if (!importResult?.data) return [];
    
    const existingGuids = new Set(existingElements.map(el => el.global_id));
    return importResult.data.filter(item => existingGuids.has(item.global_id));
  };

  const renderFileSelection = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CloudUpload sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        Excel-Datei mit Mengendaten auswählen
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Wählen Sie eine Excel-Datei (.xlsx) mit Ihren Mengendaten aus.
        <br />
        Spalten sollten GUID, Menge und Einheit enthalten.
      </Typography>
      
      <input
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        id="excel-file-input"
        type="file"
        onChange={handleFileSelect}
      />
      <label htmlFor="excel-file-input">
        <Button
          variant="contained"
          component="span"
          size="large"
          startIcon={<CloudUpload />}
          sx={{ mb: 2 }}
        >
          Datei auswählen
        </Button>
      </label>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="outlined"
          startIcon={<FileDownload />}
          onClick={downloadTemplate}
          size="small"
        >
          Vorlage herunterladen
        </Button>
      </Box>

      {importResult && !importResult.success && (
        <Alert severity="error" sx={{ mt: 3, textAlign: 'left' }}>
          <AlertTitle>Import fehlgeschlagen</AlertTitle>
          {importResult.errors.map((error, index) => (
            <Typography key={index} variant="body2">{error}</Typography>
          ))}
        </Alert>
      )}
    </Box>
  );

  const renderProcessing = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <LinearProgress sx={{ mb: 3 }} />
      <Typography variant="h6" gutterBottom>
        Verarbeite Mengendaten...
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {selectedFile?.name}
      </Typography>
    </Box>
  );

  const renderPreview = () => {
    if (!importResult) return null;

    const newElements = getNewElements();
    const updatedElements = getUpdatedElements();
    const totalChanges = newElements.length + updatedElements.length;

    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Import-Vorschau: Mengendaten
          </Typography>
          <Chip 
            label={`${totalChanges} Änderungen`}
            color={totalChanges > 0 ? 'primary' : 'default'}
            variant="filled"
          />
        </Box>

        {/* Statistics Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
          <Card variant="outlined">
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircle color="success" />
                <Box>
                  <Typography variant="h6">{importResult.stats.processedRows}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Verarbeitet
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Info color="primary" />
                <Box>
                  <Typography variant="h6">{newElements.length}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Neue Elemente
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Refresh color="warning" />
                <Box>
                  <Typography variant="h6">{updatedElements.length}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Aktualisierungen
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TableView color="info" />
                <Box>
                  <Typography variant="h6">{importResult.stats.totalRows}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Gesamt Zeilen
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Errors and Warnings */}
        {importResult.errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>
              Fehler ({importResult.errors.length})
              <IconButton size="small" onClick={() => setShowErrors(!showErrors)}>
                {showErrors ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            </AlertTitle>
            <Collapse in={showErrors}>
              <List dense>
                {importResult.errors.map((error, index) => (
                  <ListItem key={index}>
                    <ListItemIcon><ErrorIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary={error} />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </Alert>
        )}

        {importResult.warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>
              Warnungen ({importResult.warnings.length})
              <IconButton size="small" onClick={() => setShowWarnings(!showWarnings)}>
                {showWarnings ? <ExpandLess /> : <ExpandMore />}
              </IconButton>
            </AlertTitle>
            <Collapse in={showWarnings}>
              <List dense>
                {importResult.warnings.map((warning, index) => (
                  <ListItem key={index}>
                    <ListItemIcon><Warning fontSize="small" /></ListItemIcon>
                    <ListItemText primary={warning} />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </Alert>
        )}

        {/* Preview Table */}
        {totalChanges > 0 && (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>GUID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell align="right">Menge</TableCell>
                  <TableCell>Einheit</TableCell>
                  <TableCell align="right">Fläche</TableCell>
                  <TableCell align="right">Länge</TableCell>
                  <TableCell align="right">Volumen</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...newElements, ...updatedElements].map((item, index) => {
                  const isNew = !existingElements.some(el => el.global_id === item.global_id);
                  
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {item.global_id.substring(0, 8)}...
                        </Typography>
                      </TableCell>
                      <TableCell>{item.name || '-'}</TableCell>
                      <TableCell>{item.type || '-'}</TableCell>
                      <TableCell align="right">
                        {item.quantity?.value !== undefined && item.quantity?.value !== null ? item.quantity.value.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={item.quantity?.unit || '-'} 
                          size="small" 
                          variant="outlined"
                          color={item.quantity?.unit ? 'primary' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {item.area !== undefined && item.area !== null ? `${item.area.toFixed(2)} m²` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.length !== undefined && item.length !== null ? `${item.length.toFixed(2)} m` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.volume !== undefined && item.volume !== null ? `${item.volume.toFixed(2)} m³` : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isNew ? 'Neu' : 'Update'}
                          color={isNew ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {totalChanges === 0 && (
          <Alert severity="info">
            <AlertTitle>Keine Änderungen</AlertTitle>
            Alle importierten Elemente entsprechen den vorhandenen Daten.
          </Alert>
        )}
      </Box>
    );
  };

  const renderComplete = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Fade in={true}>
        <Box>
          <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Import erfolgreich!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Die Mengendaten wurden erfolgreich importiert.
          </Typography>
        </Box>
      </Fade>
    </Box>
  );

  const getStepContent = () => {
    switch (activeStep) {
      case 'file-selection':
        return renderFileSelection();
      case 'processing':
        return renderProcessing();
      case 'preview':
        return renderPreview();
      case 'complete':
        return renderComplete();
      default:
        return null;
    }
  };

  const canProceed = activeStep === 'preview' && importResult?.success && 
                     (getNewElements().length > 0 || getUpdatedElements().length > 0);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: 600,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Excel Import: Mengendaten</Typography>
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      
      <DialogContent>
        {getStepContent()}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        {activeStep === 'file-selection' && (
          <Button onClick={handleClose}>
            Abbrechen
          </Button>
        )}
        
        {activeStep === 'preview' && (
          <>
            <Button 
              onClick={() => {
                setActiveStep('file-selection');
                setSelectedFile(null);
                setImportResult(null);
              }}
            >
              Neue Datei
            </Button>
            <Button
              variant="contained"
              onClick={handleImportConfirm}
              disabled={!canProceed}
              startIcon={<CheckCircle />}
            >
              Mengendaten importieren
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ExcelImportDialog; 