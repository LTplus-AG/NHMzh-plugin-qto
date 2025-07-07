import { useState, useCallback } from 'react';
import { ExcelImportResult } from '../utils/excelService';

interface UseExcelDialogReturn {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  importResult: ExcelImportResult | null;
  setImportResult: (result: ExcelImportResult | null) => void;
  isImporting: boolean;
  setIsImporting: (importing: boolean) => void;
  isExporting: boolean;
  setIsExporting: (exporting: boolean) => void;
  lastImportTime: Date | null;
  setLastImportTime: (time: Date | null) => void;
  lastExportTime: Date | null;
  setLastExportTime: (time: Date | null) => void;
  importCount: number;
  setImportCount: (count: number) => void;
  exportCount: number;
  setExportCount: (count: number) => void;
}

export const useExcelDialog = (): UseExcelDialogReturn => {
  const [isOpen, setIsOpen] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastImportTime, setLastImportTime] = useState<Date | null>(null);
  const [lastExportTime, setLastExportTime] = useState<Date | null>(null);
  const [importCount, setImportCount] = useState(0);
  const [exportCount, setExportCount] = useState(0);

  const openDialog = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setImportResult(null);
  }, []);

  return {
    isOpen,
    openDialog,
    closeDialog,
    importResult,
    setImportResult,
    isImporting,
    setIsImporting,
    isExporting,
    setIsExporting,
    lastImportTime,
    setLastImportTime,
    lastExportTime,
    setLastExportTime,
    importCount,
    setImportCount,
    exportCount,
    setExportCount,
  };
}; 