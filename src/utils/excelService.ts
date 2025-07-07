import * as ExcelJS from 'exceljs';
import { IFCElement } from '../types/types';

export interface ExcelExportConfig {
  fileName: string;
  includeGuid?: boolean;
  includeQuantities?: boolean;
  includeUnits?: boolean;
  includeMaterials?: boolean;
}

export interface ExcelImportData {
  global_id: string;
  name?: string;
  type?: string;
  quantity?: {
    value: number | null;
    type: string;
    unit: string;
  };
  area?: number | null;
  length?: number | null;
  volume?: number | null;
  level?: string;
  classification_id?: string;
  classification_name?: string;
  materials?: Array<{
    name: string;
    fraction?: number;
    volume?: number;
    unit?: string;
  }>;
}

export interface ExcelImportResult {
  success: boolean;
  data: ExcelImportData[];
  errors: string[];
  warnings: string[];
  stats: {
    totalRows: number;
    processedRows: number;
    newElements: number;
    updatedElements: number;
    errorRows: number;
  };
}

export class ExcelService {
  
  static async exportToExcel(
    elements: IFCElement[],
    config: ExcelExportConfig
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    
    // Add metadata
    workbook.creator = 'QTO Plugin';
    workbook.lastModifiedBy = 'QTO Plugin';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    // Create main worksheet
    const worksheet = workbook.addWorksheet('Mengendaten');
    
    // Setup headers based on config
    const headers: string[] = [];
    
    if (config.includeGuid !== false) {
      headers.push('GUID');
    }
    
    headers.push('Name', 'Typ', 'Ebene');
    
    if (config.includeQuantities !== false) {
      headers.push('Menge', 'Einheit');
    }
    
    headers.push('Fläche (m²)', 'Länge (m)', 'Volumen (m³)');
    
    if (config.includeMaterials) {
      headers.push('Materialien');
    }
    
    headers.push('Klassifikation ID', 'Klassifikation Name');
    
    // Add headers
    const headerRow = worksheet.addRow(headers);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Add data rows
    elements.forEach(element => {
      const row: any[] = [];
      
      if (config.includeGuid !== false) {
        row.push(element.global_id);
      }
      
      row.push(element.name || '', element.type || '', element.level || '');
      
      if (config.includeQuantities !== false) {
        if (element.quantity) {
          row.push(element.quantity.value, element.quantity.unit || '');
        } else {
          row.push('', '');
        }
      }
      
      row.push(
        element.area || '',
        element.length || '',
        element.volume || ''
      );
      
      if (config.includeMaterials) {
        const materialsText = element.materials?.map(m => 
          `${m.name}${m.fraction ? ` (${(m.fraction * 100).toFixed(1)}%)` : ''}`
        ).join(', ') || '';
        row.push(materialsText);
      }
      
      row.push(
        element.classification_id || '',
        element.classification_name || ''
      );
      
      worksheet.addRow(row);
    });
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column && column.eachCell) {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      }
    });
    
    // Create buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.fileName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
  
  static async importFromExcel(file: File): Promise<ExcelImportResult> {
    const result: ExcelImportResult = {
      success: false,
      data: [],
      errors: [],
      warnings: [],
      stats: {
        totalRows: 0,
        processedRows: 0,
        newElements: 0,
        updatedElements: 0,
        errorRows: 0
      }
    };
    
    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);
      
      const worksheet = workbook.getWorksheet('Mengendaten');
      if (!worksheet) {
        result.errors.push('Arbeitsblatt "Mengendaten" nicht gefunden');
        return result;
      }
      
      const headerRow = worksheet.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value?.toString() || '';
      });
      
      // Find column indices (ExcelJS headers array is 1-based)
      const guidIndex = headers.indexOf('GUID');
      const nameIndex = headers.indexOf('Name');
      const typeIndex = headers.indexOf('Typ');
      const levelIndex = headers.indexOf('Ebene');
      const quantityIndex = headers.indexOf('Menge');
      const unitIndex = headers.indexOf('Einheit');
      const areaIndex = headers.indexOf('Fläche (m²)');
      const lengthIndex = headers.indexOf('Länge (m)');
      const volumeIndex = headers.indexOf('Volumen (m³)');
      const classificationIdIndex = headers.indexOf('Klassifikation ID');
      const classificationNameIndex = headers.indexOf('Klassifikation Name');
      const materialsIndex = headers.indexOf('Materialien');
      
      if (guidIndex === -1) {
        result.errors.push('Spalte "GUID" nicht gefunden');
        return result;
      }
      
      // Process data rows
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        
        result.stats.totalRows++;
        
        const guid = row.getCell(guidIndex).value?.toString();
        if (!guid) {
          result.warnings.push(`Zeile ${rowNumber}: GUID ist leer`);
          result.stats.errorRows++;
          return;
        }
        
        const name = row.getCell(nameIndex).value?.toString();
        const type = row.getCell(typeIndex).value?.toString();
        const level = row.getCell(levelIndex).value?.toString();
        
        // Parse quantity
        const quantityValue = row.getCell(quantityIndex).value;
        const unitValue = row.getCell(unitIndex).value?.toString();
        
        let quantity: { value: number | null; type: string; unit: string } | undefined;
        
        if (quantityValue !== undefined && quantityValue !== null) {
          let numValue: number | null = null;
          
          if (typeof quantityValue === 'number') {
            numValue = quantityValue;
          } else if (typeof quantityValue === 'string') {
            const parsed = parseFloat(quantityValue.trim());
            if (!isNaN(parsed)) {
              numValue = parsed;
            }
          }
          
          if (numValue !== null) {
            // Determine quantity type based on unit or element type
            let quantityType = 'area'; // default
            
            if (unitValue) {
              if (unitValue.includes('m²')) {
                quantityType = 'area';
              } else if (unitValue.includes('m³')) {
                quantityType = 'volume';
              } else if (unitValue.includes('m') && !unitValue.includes('m²') && !unitValue.includes('m³')) {
                quantityType = 'length';
              } else if (unitValue.includes('Stk') || unitValue.includes('Stück')) {
                quantityType = 'count';
              }
            }
            
            quantity = {
              value: numValue,
              type: quantityType,
              unit: unitValue || ''
            };
          }
        }
        
        // Parse individual measurements
        const parseNumberValue = (value: any): number | null => {
          if (typeof value === 'number') return value;
          if (typeof value === 'string') {
            const parsed = parseFloat(value.trim());
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        };
        
        const area = parseNumberValue(row.getCell(areaIndex).value);
        const length = parseNumberValue(row.getCell(lengthIndex).value);
        const volume = parseNumberValue(row.getCell(volumeIndex).value);
        
        // Parse materials if present
        let materials: Array<{name: string; fraction?: number; volume?: number; unit?: string}> | undefined;
        if (materialsIndex !== -1) {
          const materialsText = row.getCell(materialsIndex).value?.toString();
          if (materialsText) {
            materials = materialsText.split(',').map(mat => {
              const trimmed = mat.trim();
              const match = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)%\)$/);
              if (match) {
                return {
                  name: match[1].trim(),
                  fraction: parseFloat(match[2]) / 100,
                  unit: 'm³'
                };
              }
              return {
                name: trimmed,
                unit: 'm³'
              };
            });
          }
        }
        
        const importData: ExcelImportData = {
          global_id: guid,
          name,
          type,
          quantity,
          area,
          length,
          volume,
          level,
          classification_id: row.getCell(classificationIdIndex).value?.toString(),
          classification_name: row.getCell(classificationNameIndex).value?.toString(),
          materials
        };
        
        result.data.push(importData);
        result.stats.processedRows++;
      });
      
      // Set success if we processed at least some data
      result.success = result.data.length > 0;
      
      if (result.data.length === 0) {
        result.errors.push('Keine gültigen Daten gefunden');
      }
      
    } catch (error) {
      result.errors.push(`Fehler beim Lesen der Excel-Datei: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    }
    
    return result;
  }
  
  static async generateTemplate(elements: IFCElement[]): Promise<void> {
    const config: ExcelExportConfig = {
      fileName: `mengendaten-template-${new Date().toISOString().split('T')[0]}`,
      includeGuid: true,
      includeQuantities: true,
      includeUnits: true,
      includeMaterials: true
    };
    
    // Create a sample with first few elements or empty template
    const sampleElements = elements.slice(0, 5);
    
    await this.exportToExcel(sampleElements, config);
  }
} 