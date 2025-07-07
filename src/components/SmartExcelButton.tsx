import React, { useState, useEffect } from 'react';
import {
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Box,
  Typography,
  CircularProgress,
  Fade,
  Tooltip,
  Snackbar,
  Alert
} from '@mui/material';
import {
  FileDownload,
  FileUpload,
  TableView,
  CheckCircle,
  Error,
  Schedule,
  KeyboardArrowDown
} from '@mui/icons-material';

interface Props {
  onExport: () => Promise<void>;
  onImport: () => void;
  isExporting: boolean;
  isImporting: boolean;
  lastExportTime?: Date;
  lastImportTime?: Date;
  exportCount?: number;
  importCount?: number;
  disabled?: boolean;
}

type ProcessState = 'idle' | 'exporting' | 'importing' | 'export-success' | 'import-success' | 'error';

const SmartExcelButton: React.FC<Props> = ({
  onExport,
  onImport,
  isExporting,
  isImporting,
  lastExportTime,
  lastImportTime,
  exportCount = 0,
  importCount = 0,
  disabled = false
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [processState, setProcessState] = useState<ProcessState>('idle');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'info'>('success');
  const open = Boolean(anchorEl);

  // Update process state based on props
  useEffect(() => {
    if (isExporting) {
      setProcessState('exporting');
    } else if (isImporting) {
      setProcessState('importing');
    } else if (processState === 'exporting') {
      setProcessState('export-success');
      setToastMessage('Excel-Datei erfolgreich heruntergeladen!');
      setToastSeverity('success');
      setShowToast(true);
      setTimeout(() => setProcessState('idle'), 3000);
    } else if (processState === 'importing') {
      setProcessState('import-success');
      setToastMessage('Excel-Import erfolgreich abgeschlossen!');
      setToastSeverity('success');
      setShowToast(true);
      setTimeout(() => setProcessState('idle'), 3000);
    }
  }, [isExporting, isImporting, processState]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = async () => {
    handleClose();
    try {
      await onExport();
    } catch (error) {
      setProcessState('error');
      setToastMessage('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
      setToastSeverity('error');
      setShowToast(true);
      setTimeout(() => setProcessState('idle'), 3000);
    }
  };

  const handleImport = () => {
    handleClose();
    onImport();
  };

  const handleToastClose = () => {
    setShowToast(false);
  };

  const getButtonContent = () => {
    switch (processState) {
      case 'exporting':
        return {
          icon: <CircularProgress size={20} color="inherit" />,
          text: 'Exportiere...',
          color: 'primary' as const,
          disabled: true
        };
      case 'importing':
        return {
          icon: <CircularProgress size={20} color="inherit" />,
          text: 'Importiere...',
          color: 'primary' as const,
          disabled: true
        };
      case 'export-success':
        return {
          icon: <CheckCircle />,
          text: 'Exportiert',
          color: 'success' as const,
          disabled: false
        };
      case 'import-success':
        return {
          icon: <CheckCircle />,
          text: 'Importiert',
          color: 'success' as const,
          disabled: false
        };
      case 'error':
        return {
          icon: <Error />,
          text: 'Fehler',
          color: 'error' as const,
          disabled: false
        };
      default:
        return {
          icon: <TableView />,
          text: 'Excel',
          color: 'inherit' as const,
          disabled: false
        };
    }
  };

  const buttonContent = getButtonContent();
  const hasActivity = exportCount > 0 || importCount > 0;

  return (
    <>
      <Box sx={{ position: 'relative' }}>
        <ButtonGroup variant="outlined" size="medium">
          <Tooltip 
            title={
              hasActivity 
                ? `${exportCount} Exporte, ${importCount} Importe`
                : 'Excel Export/Import für Mengendaten'
            }
          >
            <Button
              onClick={handleClick}
              disabled={buttonContent.disabled || disabled}
              color={buttonContent.color}
              startIcon={buttonContent.icon}
              endIcon={<KeyboardArrowDown />}
              sx={{
                minWidth: 120,
                textTransform: 'none',
                fontWeight: 500,
                borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'divider',
                color: 'text.primary',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'action.hover'
                },
                transition: 'all 0.2s ease-in-out'
              }}
            >
              {buttonContent.text}
            </Button>
          </Tooltip>
        </ButtonGroup>

        {/* Activity indicator */}
        {hasActivity && processState === 'idle' && (
          <Fade in={true}>
            <Chip
              size="small"
              label={`${exportCount + importCount}`}
              color="primary"
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                minWidth: 20,
                height: 20,
                fontSize: '0.7rem',
                fontWeight: 'bold'
              }}
            />
          </Fade>
        )}

        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 350,
              boxShadow: (theme) => theme.palette.mode === 'dark' 
                ? '0 8px 32px rgba(0,0,0,0.8)' 
                : '0 8px 32px rgba(0,0,0,0.12)',
              border: '1px solid',
              borderColor: (theme) => theme.palette.mode === 'dark' 
                ? 'rgba(255, 255, 255, 0.23)' 
                : 'divider'
            }
          }}
        >
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" color="text.primary" sx={{ fontWeight: 600 }}>
              Excel Export/Import
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Mengendaten mit Einheiten verwalten
            </Typography>
          </Box>

          <MenuItem onClick={handleExport} disabled={isExporting || isImporting || disabled}>
            <ListItemIcon>
              <FileDownload color="primary" />
            </ListItemIcon>
            <ListItemText 
              primary="Mengendaten exportieren"
              secondary="Alle Elemente mit Mengen und Einheiten exportieren"
            />
          </MenuItem>

          <MenuItem onClick={handleImport} disabled={isExporting || isImporting || disabled}>
            <ListItemIcon>
              <FileUpload color="secondary" />
            </ListItemIcon>
            <ListItemText 
              primary="Mengendaten importieren"
              secondary="Excel-Datei mit Mengendaten importieren"
            />
          </MenuItem>

          {(lastExportTime || lastImportTime) && (
            <>
                             <Box sx={{ 
                 px: 2, 
                 py: 1.5, 
                 backgroundColor: (theme) => theme.palette.mode === 'dark' 
                   ? 'rgba(255, 255, 255, 0.08)' 
                   : 'grey.50',
                 borderTop: '1px solid', 
                 borderColor: (theme) => theme.palette.mode === 'dark' 
                   ? 'rgba(255, 255, 255, 0.23)' 
                   : 'divider' 
               }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                  Letzte Aktivität
                </Typography>
                
                {lastExportTime && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <FileDownload sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      Export: {lastExportTime.toLocaleString('de-DE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Typography>
                  </Box>
                )}
                
                {lastImportTime && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileUpload sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      Import: {lastImportTime.toLocaleString('de-DE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Typography>
                  </Box>
                )}
              </Box>
            </>
          )}

          {hasActivity && (
            <Box sx={{ px: 2, py: 1.5, backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {exportCount} Exporte • {importCount} Importe
                </Typography>
                <Schedule sx={{ fontSize: 14 }} />
              </Box>
            </Box>
          )}
        </Menu>
      </Box>

      {/* Toast Notification */}
      <Snackbar
        open={showToast}
        autoHideDuration={4000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={handleToastClose} 
          severity={toastSeverity} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default SmartExcelButton; 