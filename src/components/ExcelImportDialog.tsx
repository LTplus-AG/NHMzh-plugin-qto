import {
  Add,
  CheckCircle,
  Close,
  CloudUpload,
  FileDownload,
  Info,
  Refresh,
  Search,
  TableView,
  Warning,
  ArrowUpward,
  ArrowDownward
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Fade,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { IFCElement } from '../types/types';
import { ExcelImportData, ExcelImportResult, ExcelService } from '../utils/excelService';
import { getEbkpNameFromCode } from '../data/ebkpData';
import logger from '../utils/logger';
import { getVolumeValue } from '../utils/volumeHelpers';

// Using library debounce hook

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
  const [processingProgress, setProcessingProgress] = useState(0);
  const progressRef = useRef(0);

  const [copySuccess, setCopySuccess] = useState(false);
  const [copiedGuid, setCopiedGuid] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Debounced search for performance optimization
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setProcessingProgress(0);
      progressRef.current = 0;
      processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    try {
      // Smooth progress updates using ref to avoid closure issues
      const updateProgress = (target: number, duration: number) => {
        return new Promise<void>((resolve) => {
          const start = progressRef.current;
          const startTime = Date.now();
          const step = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const newProgress = start + (target - start) * progress;
            progressRef.current = newProgress;
            setProcessingProgress(newProgress);
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      };

      // Stage 1: Reading file (0 -> 30%)
      await updateProgress(30, 300);
      
      // Stage 2: Parsing Excel (30 -> 80%)
      const result = await ExcelService.importFromExcel(file);
      await updateProgress(80, 200);
      
      // Stage 3: Finalizing (80 -> 100%)
      setImportResult(result);
      await updateProgress(100, 200);

      if (result.success && result.data.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 150));
        setActiveStep('preview');
      } else {
        setActiveStep('file-selection');
      }
    } catch (error) {
      logger.error('Import processing failed:', error);
      alert('Fehler beim Verarbeiten der Excel-Datei');
      setActiveStep('file-selection');
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
    onClose();
  };

  const downloadTemplate = async () => {
    // Use existing elements to create template
    await ExcelService.generateTemplate(existingElements);
  };



  // Helper function to normalize values for comparison (treat null, undefined, empty string as equivalent)
  const normalizeValue = (value: any): any => {
    if (value === null || value === undefined || value === '' || value === '-') {
      return null;
    }
    // Also handle string representations of null/empty
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '' || trimmed === '-' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
        return null;
      }
    }
    return value;
  };

  // Helper to compare floating point numbers with tolerance
  const areNumbersEqual = (a: number | null, b: number | null, tolerance = 0.001): boolean => {
    // Treat null and undefined as equivalent
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    // Compare numeric values with tolerance
    return Math.abs(a - b) <= tolerance;
  };

  // Helper function to check if a field has changed
  const hasFieldChanged = (item: ExcelImportData, existingElement: IFCElement | undefined, fieldName: string): boolean => {
    if (!existingElement) return false;

    switch (fieldName) {
      case 'name':
        return normalizeValue(item.name) !== normalizeValue(existingElement.name);
      case 'type':
        return normalizeValue(item.type) !== normalizeValue(existingElement.type);
      case 'area':
        return !areNumbersEqual(item.area ?? null, existingElement.area ?? null);
      case 'length':
        return !areNumbersEqual(item.length ?? null, existingElement.length ?? null);
      case 'volume':
        return !areNumbersEqual(item.volume ?? null, getVolumeValue(existingElement.volume) ?? null);
      case 'level':
        return normalizeValue(item.level) !== normalizeValue(existingElement.level);
      case 'classification_id':
        return normalizeValue(item.classification_id) !== normalizeValue(existingElement.classification_id);
      case 'classification_name':
        {
          const itemName = getEbkpNameFromCode(item.classification_id);
          const existingName = getEbkpNameFromCode(existingElement.classification_id);
          return normalizeValue(itemName) !== normalizeValue(existingName);
        }
      default:
        return false;
    }
  };

  // Get existing element for comparison
  const getExistingElement = useCallback((globalId: string): IFCElement | undefined => {
    return existingElements.find(el => el.global_id === globalId);
  }, [existingElements]);

  // Handle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper function to create beautiful highlighting styles
  const getChangedCellStyle = (hasChanged: boolean, minWidth: number = 80) => ({
    backgroundColor: hasChanged
      ? 'rgba(255, 193, 7, 0.08)'
      : 'transparent',
    borderLeft: hasChanged
      ? '3px solid #ffc107'
      : '3px solid transparent',
    position: 'relative' as const,
    transition: 'all 0.15s ease-in-out',
    minWidth,
    '&::after': hasChanged ? {
      content: '""',
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      background: 'linear-gradient(90deg, rgba(255, 193, 7, 0.03) 0%, transparent 100%)',
      pointerEvents: 'none'
    } : {}
  });

  // Memoized filter and sort elements for performance optimization
  const getFilteredAndSortedElements = useMemo(() => {
    return (newElements: ExcelImportData[], updatedElements: ExcelImportData[]) => {
      let elements = [...newElements, ...updatedElements];

      // Apply search filter with debounced search term
      if (debouncedSearchTerm) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        elements = elements.filter(item => {
          const existingElement = getExistingElement(item.global_id);
          return (
            item.global_id.toLowerCase().includes(searchLower) ||
            (item.name || '').toLowerCase().includes(searchLower) ||
            (item.type || '').toLowerCase().includes(searchLower) ||
            (item.classification_id || '').toLowerCase().includes(searchLower) ||
            (getEbkpNameFromCode(item.classification_id) || '').toLowerCase().includes(searchLower) ||
            (existingElement?.name || '').toLowerCase().includes(searchLower) ||
            (existingElement?.type || '').toLowerCase().includes(searchLower)
          );
        });
      }

      // Apply sorting
      if (sortField) {
        elements.sort((a, b) => {
          let aValue: any = '';
          let bValue: any = '';

          switch (sortField) {
            case 'guid':
              aValue = a.global_id;
              bValue = b.global_id;
              break;
            case 'name':
              aValue = a.name || '';
              bValue = b.name || '';
              break;
            case 'type':
              aValue = a.type || '';
              bValue = b.type || '';
              break;
            case 'area':
              aValue = a.area || 0;
              bValue = b.area || 0;
              break;
            case 'length':
              aValue = a.length || 0;
              bValue = b.length || 0;
              break;
            case 'volume':
              aValue = a.volume || 0;
              bValue = b.volume || 0;
              break;
            case 'classificationId':
              aValue = a.classification_id || '';
              bValue = b.classification_id || '';
              break;
            case 'classificationName':
              aValue = getEbkpNameFromCode(a.classification_id) || '';
              bValue = getEbkpNameFromCode(b.classification_id) || '';
              break;
          }

          if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }

          if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });
      }

      return elements;
    };
  }, [debouncedSearchTerm, sortField, sortDirection, getExistingElement]);

  // Memoized new and updated elements to prevent unnecessary recalculations
  const newElements = useMemo(() => {
    if (!importResult?.data) return [];
    const existingGuids = new Set(existingElements.map(el => el.global_id));
    return importResult.data.filter(item => !existingGuids.has(item.global_id));
  }, [importResult?.data, existingElements]);

  const updatedElements = useMemo(() => {
    if (!importResult?.data) return [];
    const existingGuids = new Set(existingElements.map(el => el.global_id));
    // Only include elements that exist AND have actual changes
    return importResult.data.filter(item => {
      if (!existingGuids.has(item.global_id)) return false;
      const existingElement = existingElements.find(el => el.global_id === item.global_id);
      if (!existingElement) return false;
      
      // Check if ANY field has changed
      const fields = ['name', 'type', 'area', 'length', 'volume', 'level', 'classification_id'];
      return fields.some(field => hasFieldChanged(item, existingElement, field));
    });
  }, [importResult?.data, existingElements]);

  // Memoized filtered and sorted elements for performance
  const filteredAndSortedElements = useMemo(() => {
    if (!importResult) return [];
    return getFilteredAndSortedElements(newElements, updatedElements);
  }, [importResult, getFilteredAndSortedElements, newElements, updatedElements]);

  // Virtualized table row component for performance with large datasets
  const VirtualizedTableRow = React.memo(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = filteredAndSortedElements[index];
    const existingElement = getExistingElement(item.global_id);

    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid rgba(224, 224, 224, 1)',
        backgroundColor: index % 2 === 0 ? 'rgba(0, 0, 0, 0.01)' : 'transparent'
      }}>
        {/* GUID */}
        <Box sx={{
          ...getChangedCellStyle(false, 120),
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          <Tooltip
            title={copySuccess && copiedGuid === item.global_id ? "Kopiert!" : "Zum Kopieren klicken"}
            placement="top"
            arrow
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                cursor: 'pointer',
                color: 'primary.main',
                '&:hover': { textDecoration: 'underline' }
              }}
              onClick={() => copyGuidToClipboard(item.global_id)}
            >
              {item.global_id.substring(0, 8)}...
            </Typography>
          </Tooltip>
        </Box>

        {/* Name */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'name'), 150),
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
            {item.name || '-'}
          </Typography>
        </Box>

        {/* Type */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'type'), 100),
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          {item.type || '-'}
        </Box>

        {/* Area */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'area'), 80),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          {item.area !== undefined && item.area !== null ? `${item.area.toFixed(2)} m²` : '-'}
        </Box>

        {/* Length */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'length'), 80),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          {item.length !== undefined && item.length !== null ? `${item.length.toFixed(2)} m` : '-'}
        </Box>

        {/* Volume */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'volume'), 80),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          {item.volume !== undefined && item.volume !== null ? `${getVolumeValue(item.volume).toFixed(2)} m³` : '-'}
        </Box>

        {/* Classification ID */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'classification_id'), 120),
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          borderRight: '1px solid rgba(224, 224, 224, 1)'
        }}>
          {item.classification_id ? (
            <Chip
              label={item.classification_id}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 120 }}
            />
          ) : '-'}
        </Box>

        {/* Classification Name */}
        <Box sx={{
          ...getChangedCellStyle(hasFieldChanged(item, existingElement, 'classification_name'), 150),
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1
        }}>
          {item.classification_id ? (
            <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
              {getEbkpNameFromCode(item.classification_id) || 'Unbekannt'}
            </Typography>
          ) : '-'}
        </Box>
      </div>
    );
  });

  VirtualizedTableRow.displayName = 'VirtualizedTableRow';

  // Copy GUID to clipboard
  const copyGuidToClipboard = async (guid: string) => {
    try {
      await navigator.clipboard.writeText(guid);
      setCopiedGuid(guid);
      setCopySuccess(true);

      // Clear any existing timer
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Set new timer and store reference
      timeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
        setCopiedGuid('');
        timeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy GUID:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = guid;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedGuid(guid);
        setCopySuccess(true);

        // Clear any existing timer
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        // Set new timer and store reference
        timeoutRef.current = setTimeout(() => {
          setCopySuccess(false);
          setCopiedGuid('');
          timeoutRef.current = null;
        }, 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  // Sortable header component
  const SortableTableCell = ({
    field,
    children,
    align = 'left',
    sx = {}
  }: {
    field: string;
    children: React.ReactNode;
    align?: 'left' | 'right' | 'center';
    sx?: any;
  }) => (
    <TableCell align={align} sx={sx}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' },
          borderRadius: 1,
          px: 1,
          py: 0.5
        }}
        onClick={() => handleSort(field)}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
          {children}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', ml: 'auto' }}>
          <ArrowUpward
            sx={{
              fontSize: 12,
              color: sortField === field && sortDirection === 'asc' ? 'primary.main' : 'text.disabled',
              lineHeight: 0.5
            }}
          />
          <ArrowDownward
            sx={{
              fontSize: 12,
              color: sortField === field && sortDirection === 'desc' ? 'primary.main' : 'text.disabled',
              lineHeight: 0.5,
              mt: -0.5
            }}
          />
        </Box>
      </Box>
    </TableCell>
  );

  const renderFileSelection = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <CloudUpload sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        Excel-Datei für Mengenimport
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Wählen Sie Ihre Excel-Datei (.xlsx) mit aktualisierten Mengendaten aus.
        <br />
        <strong>Erforderlich:</strong> GUID-Spalte für die Zuordnung zu vorhandenen Elementen
        <br />
        <strong>Optional:</strong> Mengen, Klassifikationen und weitere Eigenschaften
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
          Beispiel-Vorlage herunterladen
        </Button>
      </Box>

      {importResult && !importResult.success && (
        <Box sx={{
          mt: 3,
          p: 2,
          border: 1,
          borderColor: 'error.main',
          borderRadius: 1,
          bgcolor: 'error.light',
          color: 'error.contrastText'
        }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
            Import fehlgeschlagen
          </Typography>
          {importResult.errors.map((error, index) => (
            <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
              {error}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );

  const renderProcessing = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <LinearProgress 
        variant="determinate" 
        value={processingProgress} 
        sx={{ 
          mb: 3,
          height: 8,
          borderRadius: 4,
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
            background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)',
            transition: 'transform 0.05s linear'
          }
        }} 
      />
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

    const totalChanges = newElements.length + updatedElements.length;

    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0
      }}>
        {/* Beautiful Header Section */}
        <Box sx={{
          background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.03) 0%, rgba(25, 118, 210, 0.08) 100%)',
          borderRadius: 2,
          p: 2.5,
          mb: 2.5,
          border: '1px solid',
          borderColor: 'rgba(25, 118, 210, 0.08)'
        }}>
          {/* Top Row: Title and Statistics */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            mb: 1.5
          }}>
            {/* Left: Title + Change Count + Status */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 600,
                  color: 'primary.main',
                  letterSpacing: '-0.025em',
                  whiteSpace: 'nowrap'
                }}
              >
                Änderungsvorschau
              </Typography>
              <Chip
                label={`${totalChanges} Änderungen`}
                color="primary"
                variant="filled"
                size="small"
                sx={{ fontWeight: 600 }}
              />
              {updatedElements.length > 0 && (
                <Tooltip
                  title={
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Wichtiger Hinweis zum Status:
                      </Typography>
                      <Typography variant="body2">
                        {updatedElements.length} Elemente werden zurückgesetzt
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2">• Status: "Bestätigt" → "Ausstehend"</Typography>
                        <Typography variant="body2">• Grund: Daten wurden geändert</Typography>
                        <Typography variant="body2">• Nächster Schritt: Elemente müssen erneut bestätigt werden</Typography>
                      </Box>
                    </Box>
                  }
                  placement="bottom-start"
                  arrow
                >
                  <Chip
                    icon={<Warning fontSize="small" />}
                    label="Status Reset"
                    color="warning"
                    variant="outlined"
                    size="small"
                    sx={{ fontWeight: 500 }}
                  />
                </Tooltip>
              )}
            </Box>

            {/* Right: Compact Statistics Cards */}
            <Box sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'nowrap',
              alignItems: 'center'
            }}>
              {/* Verarbeitet */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 1,
                minWidth: 'fit-content',
                backgroundColor: 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(46, 125, 50, 0.2)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(46, 125, 50, 0.15)'
                }
              }}>
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(46, 125, 50, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ lineHeight: 1.2, color: 'success.main' }}>
                    {importResult.stats.processedRows}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem' }}>
                    Verarbeitet
                  </Typography>
                </Box>
              </Box>

              {/* Neu */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 1,
                minWidth: 'fit-content',
                backgroundColor: 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(25, 118, 210, 0.2)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)'
                }
              }}>
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Add sx={{ fontSize: 16, color: 'primary.main' }} />
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ lineHeight: 1.2, color: 'primary.main' }}>
                    {newElements.length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem' }}>
                    Neu
                  </Typography>
                </Box>
              </Box>

              {/* Aktualisiert */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 1,
                minWidth: 'fit-content',
                backgroundColor: 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(245, 124, 0, 0.2)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(245, 124, 0, 0.15)'
                }
              }}>
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(245, 124, 0, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Refresh sx={{ fontSize: 16, color: 'warning.main' }} />
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ lineHeight: 1.2, color: 'warning.main' }}>
                    {updatedElements.length}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem' }}>
                    Aktualisiert
                  </Typography>
                </Box>
              </Box>

              {/* Zeilen Total */}
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                p: 1,
                minWidth: 'fit-content',
                backgroundColor: 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'rgba(156, 39, 176, 0.2)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 8px rgba(156, 39, 176, 0.15)'
                }
              }}>
                <Box sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(156, 39, 176, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <TableView sx={{ fontSize: 16, color: '#9c27b0' }} />
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight="bold" sx={{ lineHeight: 1.2, color: '#9c27b0' }}>
                    {importResult.stats.totalRows}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1, fontSize: '0.7rem' }}>
                    Zeilen
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Bottom Row: Search Section */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 1,
              mb: 1
            }}>
              <TextField
                size="small"
                placeholder="Elemente durchsuchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  minWidth: 240,
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      backgroundColor: 'background.paper',
                      boxShadow: '0 2px 8px rgba(25, 118, 210, 0.1)'
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'background.paper',
                      boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)'
                    }
                  }
                }}
              />
              {(debouncedSearchTerm || sortField) && (
                <Chip
                  label={`${filteredAndSortedElements.length}/${totalChanges}`}
                  size="small"
                  variant="outlined"
                  color="primary"
                />
              )}
              <Tooltip
                title={
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Was bedeuten die farbigen Markierungen?
                    </Typography>
                    <Typography variant="body2">• Gelb markierte Zellen: Hier ändern sich die Werte</Typography>
                    <Typography variant="body2">• Leere Zellen: Werden nur markiert, wenn sie einen bestehenden Wert überschreiben</Typography>
                  </Box>
                }
                placement="bottom-end"
                arrow
              >
                <IconButton
                  size="small"
                  color="info"
                  sx={{
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.08)',
                      transform: 'scale(1.05)'
                    },
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <Info fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Compact Status Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0 }}>
            {/* Errors and Warnings as Compact Chips */}
            {importResult.errors.length > 0 && (
              <Tooltip
                title={
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Fehler ({importResult.errors.length})
                    </Typography>
                    {importResult.errors.map((error, index) => (
                      <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                        • {error}
                      </Typography>
                    ))}
                  </Box>
                }
                placement="bottom"
                arrow
              >
                <Chip
                  label={`Fehler: ${importResult.errors.length}`}
                  color="error"
                  size="small"
                  variant="outlined"
                />
              </Tooltip>
            )}

            {importResult.warnings.length > 0 && (
              <Tooltip
                title={
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                      Warnungen ({importResult.warnings.length})
                    </Typography>
                    {importResult.warnings.map((warning, index) => (
                      <Typography key={index} variant="body2" sx={{ mb: 0.5 }}>
                        • {warning}
                      </Typography>
                    ))}
                  </Box>
                }
                placement="bottom"
                arrow
              >
                <Chip
                  label={`Warnungen: ${importResult.warnings.length}`}
                  color="warning"
                  size="small"
                  variant="outlined"
                />
              </Tooltip>
            )}
          </Box>

          {/* Beautiful Preview Table */}
          {totalChanges > 0 && (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                flex: 1,
                minHeight: { xs: 300, sm: 400, md: 500 },
                maxHeight: { xs: '50vh', sm: '60vh', md: '70vh' },
                overflow: 'auto',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'rgba(25, 118, 210, 0.08)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                '&:hover': {
                  boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)'
                },
                transition: 'all 0.2s ease-in-out'
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: 800,
                  '& .MuiTableHead-root .MuiTableCell-root': {
                    backgroundColor: '#f5f7fa !important',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'primary.main',
                    borderBottom: '2px solid',
                    borderBottomColor: 'rgba(25, 118, 210, 0.15)',
                    backdropFilter: 'none !important'
                  },
                  '& .MuiTableBody-root .MuiTableRow-root': {
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.02)',
                      cursor: 'default'
                    },
                    '&:nth-of-type(even)': {
                      backgroundColor: 'rgba(0, 0, 0, 0.01)'
                    }
                  },
                  '& .MuiTableCell-root': {
                    transition: 'all 0.15s ease-in-out'
                  }
                }}
              >
                <TableHead>
                  <TableRow>
                    <SortableTableCell field="guid" sx={{ minWidth: 120 }}>GUID</SortableTableCell>
                    <SortableTableCell field="name" sx={{ minWidth: 150 }}>Name</SortableTableCell>
                    <SortableTableCell field="type" sx={{ minWidth: 100 }}>Typ</SortableTableCell>
                    <SortableTableCell field="area" align="right" sx={{ minWidth: 80 }}>Fläche</SortableTableCell>
                    <SortableTableCell field="length" align="right" sx={{ minWidth: 80 }}>Länge</SortableTableCell>
                    <SortableTableCell field="volume" align="right" sx={{ minWidth: 80 }}>Volumen</SortableTableCell>
                    <SortableTableCell field="classificationId" sx={{ minWidth: 120 }}>Klassifikation ID</SortableTableCell>
                    <SortableTableCell field="classificationName" sx={{ minWidth: 150 }}>Klassifikation Name</SortableTableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAndSortedElements.map((item, index) => {
                    const existingElement = getExistingElement(item.global_id);

                    return (
                      <TableRow key={`${item.global_id}-${index}`}>
                        <TableCell sx={{ minWidth: 120 }}>
                          <Tooltip
                            title={copySuccess && copiedGuid === item.global_id ? "Kopiert!" : "Zum Kopieren klicken"}
                            placement="top"
                            arrow
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                '&:hover': {
                                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  margin: '-4px -6px'
                                }
                              }}
                              onClick={() => copyGuidToClipboard(item.global_id)}
                            >
                              {item.global_id.substring(0, 8)}...
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'name'), 150)}>
                          <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                            {item.name || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'type'), 100)}>
                          {item.type || '-'}
                        </TableCell>
                        <TableCell align="right" sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'area'), 80)}>
                          {item.area !== undefined && item.area !== null ? `${item.area.toFixed(2)} m²` : '-'}
                        </TableCell>
                        <TableCell align="right" sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'length'), 80)}>
                          {item.length !== undefined && item.length !== null ? `${item.length.toFixed(2)} m` : '-'}
                        </TableCell>
                        <TableCell align="right" sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'volume'), 80)}>
                          {item.volume !== undefined && item.volume !== null ? `${getVolumeValue(item.volume).toFixed(2)} m³` : '-'}
                        </TableCell>
                        <TableCell sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'classification_id'), 120)}>
                          {item.classification_id ? (
                            <Chip
                              label={item.classification_id}
                              size="small"
                              variant="outlined"
                              color="primary"
                              sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 120 }}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell sx={getChangedCellStyle(hasFieldChanged(item, existingElement, 'classification_name'), 150)}>
                          {item.classification_id ? (
                            <Typography variant="body2" sx={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} noWrap>
                              {getEbkpNameFromCode(item.classification_id) || 'Unbekannt'}
                            </Typography>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {totalChanges === 0 && (
            <Box sx={{
              p: 2,
              border: 1,
              borderColor: 'info.main',
              borderRadius: 1,
              bgcolor: 'info.light',
              color: 'info.contrastText'
            }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Alles bereits aktuell
              </Typography>
              <Typography variant="body2">
                Alle Daten in Ihrer Excel-Datei sind bereits in der Datenbank vorhanden.
                Keine Aktualisierungen notwendig.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    );
  };

  const renderComplete = () => (
    <Box sx={{ textAlign: 'center', py: 4 }}>
      <Fade in={true}>
        <Box>
          <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Import erfolgreich abgeschlossen!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ihre Excel-Daten wurden erfolgreich importiert und sind bereit zur Überprüfung.
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
    (newElements.length > 0 || updatedElements.length > 0);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          // Different sizes based on active step
          ...(activeStep === 'file-selection' || activeStep === 'processing' || activeStep === 'complete'
            ? {
              width: { xs: '90vw', sm: '500px', md: '600px' },
              height: 'auto',
              maxWidth: '600px',
              minHeight: '400px'
            }
            : {
              width: '95vw',
              maxWidth: '1400px',
              height: '95vh',
              maxHeight: '95vh'
            }
          ),
          m: 0,
          '& .MuiDialogContent-root': {
            p: 0,
            ...(activeStep === 'preview'
              ? { height: 'calc(100% - 140px)', overflow: 'hidden' }
              : { height: 'auto', overflow: 'visible' }
            )
          }
        }
      }}
    >
      <IconButton 
        onClick={handleClose} 
        size="small"
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          zIndex: 1,
          color: 'text.secondary'
        }}
      >
        <Close />
      </IconButton>

      <DialogContent sx={{
        px: activeStep === 'preview' ? 0 : { xs: 2, sm: 3 },
        py: activeStep === 'preview' ? 0 : { xs: 1, sm: 2 },
        display: 'flex',
        flexDirection: 'column',
        gap: activeStep === 'preview' ? 0 : 2,
        ...(activeStep === 'preview' && {
          height: '100%',
          overflow: 'hidden'
        })
      }}>
        {activeStep === 'preview' ? (
          <Box sx={{
            px: { xs: 2, sm: 3 },
            py: { xs: 1, sm: 2 },
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}>
            {getStepContent()}
          </Box>
        ) : (
          getStepContent()
        )}
      </DialogContent>

      <DialogActions sx={{
        px: activeStep === 'preview' ? 0 : { xs: 2, sm: 3 },
        pb: activeStep === 'preview' ? 0 : { xs: 2, sm: 3 },
        pt: activeStep === 'preview' ? 0 : 2,
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 1 },
        ...(activeStep === 'preview' && {
          background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.02) 0%, rgba(25, 118, 210, 0.04) 100%)',
          px: { xs: 2, sm: 3 },
          pb: { xs: 2, sm: 3 },
          pt: 2,
          borderTop: '1px solid',
          borderTopColor: 'rgba(25, 118, 210, 0.08)'
        })
      }}>
        {activeStep === 'file-selection' && (
          <Button
            onClick={handleClose}
            fullWidth
            sx={{
              py: 1.25,
              fontSize: '0.95rem',
              fontWeight: 500,
              borderRadius: 1.5,
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.08)'
              }
            }}
          >
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
              fullWidth
              sx={{
                py: 1.25,
                fontSize: '0.95rem',
                fontWeight: 500,
                borderRadius: 1.5,
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.08)',
                  transform: 'translateY(-1px)'
                }
              }}
            >
              Neue Datei wählen
            </Button>
            <Button
              variant="contained"
              onClick={handleImportConfirm}
              disabled={!canProceed}
              startIcon={<CheckCircle />}
              fullWidth
              sx={{
                py: 1.25,
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: 1.5,
                background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
                boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
                  boxShadow: '0 6px 16px rgba(25, 118, 210, 0.4)',
                  transform: 'translateY(-2px)'
                },
                '&:disabled': {
                  background: 'rgba(0, 0, 0, 0.12)',
                  boxShadow: 'none',
                  transform: 'none'
                }
              }}
            >
              Änderungen übernehmen
            </Button>
          </>
        )}
      </DialogActions>

      {/* Copy Success Snackbar */}
      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{
          minWidth: 300,
          p: 2,
          bgcolor: 'success.main',
          color: 'success.contrastText',
          borderRadius: 1,
          textAlign: 'center'
        }}>
          GUID kopiert: {copiedGuid.substring(0, 12)}...
        </Box>
      </Snackbar>
    </Dialog>
  );
};

export default ExcelImportDialog; 