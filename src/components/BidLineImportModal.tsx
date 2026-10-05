import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, Upload, Check, AlertCircle, Calendar, 
  Clock, ArrowRight, Layers, Search, RefreshCw, X, ChevronRight,
  Sparkles, CheckCircle2, Filter, Eye, Tag, CalendarRange
} from 'lucide-react';
import { LogsState, LogEntry } from '../types';

interface BidLineImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogsState;
  onImportLogs: (newLogs: LogsState, targetMonth: number, targetYear: number, message: string) => void;
  viewMonth: number;
  viewYear: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface HeaderDateMatch {
  month: number;
  day: number;
  year?: number;
  dow?: string;
  label: string;
}

// Robust date header parser supporting 'Jan 01 (FRI)', '01/01/2027', 'Jan 1', plain numbers, etc.
export const parseDateHeader = (val: string, fallbackMonth: number = 0, fallbackYear: number = 2027): HeaderDateMatch | null => {
  if (!val) return null;
  const clean = val.trim();

  // Pattern 1: 'Jan 01 (FRI)' or 'Jan 1 (FRI)' or 'Jan 01' or 'January 01 (FRI)'
  const m1 = clean.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*\(?([A-Za-z]{3})\)?)?/i);
  if (m1) {
    const mStr = m1[1].toLowerCase().slice(0, 3);
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    if (mStr in months) {
      const month = months[mStr];
      const day = parseInt(m1[2], 10);
      const dow = m1[3] ? m1[3].toUpperCase() : undefined;

      // Auto-detect year from Day of Week (e.g. Jan 01 (FRI) aligns with 2027!)
      let detectedYear: number | undefined = undefined;
      if (dow) {
        const candidateYears = [2027, 2026, 2028, 2025, 2029, 2030];
        for (const yr of candidateYears) {
          const testDate = new Date(yr, month, day);
          if (DOW_NAMES[testDate.getDay()] === dow) {
            detectedYear = yr;
            break;
          }
        }
      }

      return { month, day, year: detectedYear, dow, label: clean };
    }
  }

  // Pattern 2: 'MM/DD/YYYY' or 'M/D/YYYY' or 'YYYY-MM-DD'
  const m2 = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const month = parseInt(m2[1], 10) - 1;
    const day = parseInt(m2[2], 10);
    let year = parseInt(m2[3], 10);
    if (year < 100) year += 2000;
    return { month, day, year, label: clean };
  }

  // Pattern 3: 'MM/DD'
  const m3 = clean.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m3) {
    const month = parseInt(m3[1], 10) - 1;
    const day = parseInt(m3[2], 10);
    return { month, day, label: clean };
  }

  // Pattern 4: Plain day number 1..31
  const m4 = parseInt(clean, 10);
  if (!isNaN(m4) && m4 >= 1 && m4 <= 31 && String(m4) === clean) {
    return { month: fallbackMonth, day: m4, year: fallbackYear, label: clean };
  }

  return null;
};

// Flexible shift time parser
export const parseShiftTime = (timeStr: string): { type: string; hrs: number; label: string } | null => {
  if (!timeStr) return null;
  const clean = timeStr.trim();

  // Range pattern like '0530-1400', '06:00-14:30', '0530 - 1400', '0530/1400'
  const rangeMatch = clean.match(/(\d{1,2}):?(\d{2})?\s*[\-\/]\s*(\d{1,2}):?(\d{2})?/);
  if (rangeMatch) {
    let startHour = parseInt(rangeMatch[1], 10);
    const startMin = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    let endHour = parseInt(rangeMatch[3], 10);
    const endMin = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0;

    const startDecimal = startHour + (startMin / 60);
    let endDecimal = endHour + (endMin / 60);
    if (endDecimal < startDecimal) {
      endDecimal += 24; // Overnight shift
    }
    let duration = Math.round((endDecimal - startDecimal) * 10) / 10;
    if (duration === 8.5) duration = 8.0;
    if (duration <= 0 || isNaN(duration)) duration = 8.0;

    let type = 'WORK';
    if (startHour >= 4 && startHour <= 10) type = 'WORK-AM';
    else if (startHour >= 11 && startHour <= 17) type = 'WORK-PM';
    else if (startHour >= 18 || startHour <= 3) type = 'WORK-MID';

    const fmtStart = `${String(startHour).padStart(2, '0')}${String(startMin).padStart(2, '0')}`;
    const fmtEnd = `${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}`;
    const label = `${fmtStart}-${fmtEnd}`;

    return { type, hrs: duration, label };
  }

  // 4-digit start time pattern like '0530', '0600', '1430', '2200'
  const startOnlyMatch = clean.match(/^(\d{2})(\d{2})$/);
  if (startOnlyMatch) {
    const sHour = parseInt(startOnlyMatch[1], 10);
    const sMin = parseInt(startOnlyMatch[2], 10);
    if (sHour >= 0 && sHour <= 23 && sMin >= 0 && sMin <= 59) {
      let eHour = (sHour + 8 + (sMin >= 30 ? 1 : 0)) % 24;
      let eMin = sMin === 30 ? 0 : 30;
      const fmtStart = `${String(sHour).padStart(2, '0')}${String(sMin).padStart(2, '0')}`;
      const fmtEnd = `${String(eHour).padStart(2, '0')}${String(eMin).padStart(2, '0')}`;
      
      let type = 'WORK';
      if (sHour >= 4 && sHour <= 10) type = 'WORK-AM';
      else if (sHour >= 11 && sHour <= 17) type = 'WORK-PM';
      else if (sHour >= 18 || sHour <= 3) type = 'WORK-MID';

      return { type, hrs: 8.0, label: `${fmtStart}-${fmtEnd}` };
    }
  }

  return null;
};

interface DateColumnDef {
  colIndex: number;
  dateStr: string; // YYYY-MM-DD
  year: number;
  month: number;
  day: number;
  dow: string;
  label: string;
}

interface ParsedSheetData {
  name: string;
  rows: string[][];
  headerRowIndex: number;
  baseYear: number;
  dayColumns: DateColumnDef[];
  distinctMonths: { year: number; month: number; label: string; count: number }[];
  lineRows: {
    rowIndex: number;
    lineId: string;
    role?: string;
    skill?: string;
    slots?: string;
    description: string;
    shiftTime?: string;
    daysOff?: string;
    workDaysCount: number;
  }[];
}

export const BidLineImportModal: React.FC<BidLineImportModalProps> = ({
  isOpen,
  onClose,
  logs,
  onImportLogs,
  viewMonth,
  viewYear,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workbook state
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [selectedLineRowIndex, setSelectedLineRowIndex] = useState<number | null>(null);

  // Active preview month filter ('all' or 'YYYY-MM')
  const [previewMonthFilter, setPreviewMonthFilter] = useState<string>('all');

  // Search filter for lines
  const [lineSearch, setLineSearch] = useState<string>('');

  // Fallback / Default shift configurations
  const [defaultShiftTime, setDefaultShiftTime] = useState<string>('0600-1430');
  const [defaultShiftHours, setDefaultShiftHours] = useState<number>(8.0);
  const [replaceExistingBid, setReplaceExistingBid] = useState<boolean>(true);

  // Status & Error message
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Base year state (default to 2027 as requested)
  const [baseYear, setBaseYear] = useState<number>(2027);

  // Process a loaded file buffer
  const handleWorkbookData = (data: ArrayBuffer, name: string) => {
    try {
      setErrorMessage('');
      const wb = XLSX.read(data, { type: 'array' });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        setErrorMessage('The uploaded Excel file contains no worksheets.');
        return;
      }
      setWorkbook(wb);
      setFileName(name);

      const allText = `${name} ${wb.SheetNames.join(' ')}`.toLowerCase();
      if (allText.includes('2027')) {
        setBaseYear(2027);
      } else if (allText.includes('2026')) {
        setBaseYear(2026);
      }

      setSelectedSheetName(wb.SheetNames[0]);
      setSelectedLineRowIndex(null);
      setPreviewMonthFilter('all');
    } catch (err: any) {
      console.error('Error reading workbook:', err);
      setErrorMessage(`Failed to read Excel file: ${err?.message || 'Invalid format'}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        handleWorkbookData(event.target.result as ArrayBuffer, file.name);
      }
    };
    reader.onerror = () => setErrorMessage('Error reading local file.');
    reader.readAsArrayBuffer(file);
  };

  // Generate a realistic full 3-month (Jan, Feb, Mar 2027) demo SWA Bid Package in memory
  const handleLoadDemoBidSheet = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Build full 90-day headers for Q1 2027: Jan (31) + Feb (28) + Mar (31)
      const dateHeaders90 = [
        'Line Number', 'Role', 'Skill', 'Slots', 'Midnight Shift Diff ($)'
      ];

      const allDays: { year: number; month: number; day: number; dow: string }[] = [];

      // January (31 days)
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(2027, 0, d);
        const dow = DOW_NAMES[dt.getDay()];
        dateHeaders90.push(`Jan ${String(d).padStart(2, '0')} (${dow})`);
        allDays.push({ year: 2027, month: 0, day: d, dow });
      }
      // February (28 days)
      for (let d = 1; d <= 28; d++) {
        const dt = new Date(2027, 1, d);
        const dow = DOW_NAMES[dt.getDay()];
        dateHeaders90.push(`Feb ${String(d).padStart(2, '0')} (${dow})`);
        allDays.push({ year: 2027, month: 1, day: d, dow });
      }
      // March (31 days)
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(2027, 2, d);
        const dow = DOW_NAMES[dt.getDay()];
        dateHeaders90.push(`Mar ${String(d).padStart(2, '0')} (${dow})`);
        allDays.push({ year: 2027, month: 2, day: d, dow });
      }

      // Tab 1: AM Lines (Full 3-Month Bid)
      const amRows: any[][] = [dateHeaders90];
      const demoAmLines = [
        { id: '1', role: 'Ramp Agent', skill: 'Provisioning', slots: '1', shift: '0530-1400', offDays: ['TUE', 'WED'] },
        { id: '2', role: 'Ramp Agent', skill: 'Provisioning', slots: '1', shift: '0600-1430', offDays: ['SAT', 'SUN'] },
        { id: '3', role: 'Ramp Agent', skill: 'Floor', slots: '2', shift: '0600-1430', offDays: ['SUN', 'MON'] },
        { id: '4', role: 'Customer Service', skill: 'Gates', slots: '1', shift: '0500-1330', offDays: ['THU', 'FRI'] },
        { id: '5', role: 'Operations', skill: 'Freight', slots: '1', shift: '0700-1530', offDays: ['SAT', 'SUN'] },
      ];

      demoAmLines.forEach(l => {
        const row: any[] = [l.id, l.role, l.skill, l.slots, '0.00'];
        allDays.forEach(dayInfo => {
          const isOff = l.offDays.includes(dayInfo.dow);
          row.push(isOff ? 'OFF' : l.shift);
        });
        amRows.push(row);
      });

      // Tab 2: PM Lines (Full 3-Month Bid)
      const pmRows: any[][] = [dateHeaders90];
      const demoPmLines = [
        { id: '11', role: 'Ramp Agent', skill: 'Floor', slots: '1', shift: '1430-2300', offDays: ['THU', 'FRI'] },
        { id: '12', role: 'Ramp Agent', skill: 'Provisioning', slots: '1', shift: '1430-2300', offDays: ['SAT', 'SUN'] },
        { id: '13', role: 'Operations', skill: 'Bag Room', slots: '2', shift: '1500-2330', offDays: ['MON', 'TUE'] },
      ];
      demoPmLines.forEach(l => {
        const row: any[] = [l.id, l.role, l.skill, l.slots, '0.00'];
        allDays.forEach(dayInfo => {
          const isOff = l.offDays.includes(dayInfo.dow);
          row.push(isOff ? 'OFF' : l.shift);
        });
        pmRows.push(row);
      });

      // Tab 3: Midnight Lines (Full 3-Month Bid)
      const midRows: any[][] = [dateHeaders90];
      const demoMidLines = [
        { id: '21', role: 'Ramp Agent', skill: 'Midnight', slots: '1', shift: '2200-0630', offDays: ['FRI', 'SAT', 'SUN'] },
        { id: '22', role: 'Ramp Agent', skill: 'Floor', slots: '1', shift: '2200-0630', offDays: ['SUN', 'MON', 'TUE'] },
      ];
      demoMidLines.forEach(l => {
        const row: any[] = [l.id, l.role, l.skill, l.slots, '1.00'];
        allDays.forEach(dayInfo => {
          const isOff = l.offDays.includes(dayInfo.dow);
          row.push(isOff ? 'OFF' : l.shift);
        });
        midRows.push(row);
      });

      const wsAm = XLSX.utils.aoa_to_sheet(amRows);
      const wsPm = XLSX.utils.aoa_to_sheet(pmRows);
      const wsMid = XLSX.utils.aoa_to_sheet(midRows);

      XLSX.utils.book_append_sheet(wb, wsAm, 'Full-Time AM Bid (3-Mo)');
      XLSX.utils.book_append_sheet(wb, wsPm, 'Full-Time PM Bid (3-Mo)');
      XLSX.utils.book_append_sheet(wb, wsMid, 'Midnight Bid (3-Mo)');

      const outBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      handleWorkbookData(outBuffer, 'SWA_2027_3_Month_Bid_Package.xlsx');
    } catch (e: any) {
      setErrorMessage(`Demo generation failed: ${e?.message}`);
    }
  };

  // Parse currently selected sheet and scan for all dates across the bid
  const parsedSheet = useMemo<ParsedSheetData | null>(() => {
    if (!workbook || !selectedSheetName) return null;
    const sheet = workbook.Sheets[selectedSheetName];
    if (!sheet) return null;

    const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: ''
    });

    if (!rawRows || rawRows.length === 0) return null;

    // Scan top 15 rows to find the header row containing date columns
    let bestHeaderRowIndex = -1;
    let maxDateColsCount = 0;
    let initialDetectedYear = baseYear;

    // First, check candidate rows
    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
      const row = rawRows[r];
      let dateColsCount = 0;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        const dateMatch = parseDateHeader(val, 0, baseYear);
        if (dateMatch && dateMatch.day >= 1 && dateMatch.day <= 31) {
          dateColsCount++;
          if (dateMatch.year) {
            initialDetectedYear = dateMatch.year;
          }
        }
      }

      if (dateColsCount > maxDateColsCount && dateColsCount >= 7) {
        maxDateColsCount = dateColsCount;
        bestHeaderRowIndex = r;
      }
    }

    if (bestHeaderRowIndex === -1 && rawRows.length > 1) {
      bestHeaderRowIndex = 0;
    }

    const headerRow = rawRows[bestHeaderRowIndex] || [];
    const dateColumns: DateColumnDef[] = [];
    let currentTrackingYear = initialDetectedYear;
    let previousMonth = -1;

    // Parse all date columns in the detected header row
    for (let c = 0; c < headerRow.length; c++) {
      const cellVal = String(headerRow[c] || '').trim();
      const match = parseDateHeader(cellVal, previousMonth >= 0 ? previousMonth : 0, currentTrackingYear);

      if (match && match.day >= 1 && match.day <= 31) {
        let m = match.month >= 0 ? match.month : (previousMonth >= 0 ? previousMonth : 0);
        let y = match.year || currentTrackingYear;

        // If month rolled over from Dec (11) to Jan (0), increment tracking year
        if (previousMonth === 11 && m === 0) {
          currentTrackingYear++;
          y = currentTrackingYear;
        }

        previousMonth = m;

        const dt = new Date(y, m, match.day);
        const dow = match.dow || DOW_NAMES[dt.getDay()];
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(match.day).padStart(2, '0')}`;

        dateColumns.push({
          colIndex: c,
          dateStr,
          year: y,
          month: m,
          day: match.day,
          dow,
          label: match.label
        });
      }
    }

    // Identify distinct months covered in this bid package
    const monthMap = new Map<string, { year: number; month: number; label: string; count: number }>();
    dateColumns.forEach(dc => {
      const key = `${dc.year}-${String(dc.month + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) {
        monthMap.set(key, {
          year: dc.year,
          month: dc.month,
          label: `${MONTH_NAMES[dc.month]} ${dc.year}`,
          count: 0
        });
      }
      monthMap.get(key)!.count++;
    });
    const distinctMonths = Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    // Scan bid lines/rows
    const lineRows: ParsedSheetData['lineRows'] = [];
    for (let r = bestHeaderRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const firstCell = String(row[0] || '').trim();
      const secondCell = String(row[1] || '').trim();
      const thirdCell = String(row[2] || '').trim();
      const fourthCell = String(row[3] || '').trim();

      const nonEmptyCells = row.filter(c => String(c || '').trim() !== '');
      if (nonEmptyCells.length < 2) continue;
      if (firstCell.toLowerCase().includes('total') || firstCell.toLowerCase().includes('page')) continue;

      let lineId = firstCell || `Line ${r}`;
      let role = secondCell;
      let skill = thirdCell;
      let slots = fourthCell;

      let shiftTime = '';
      let daysOff = '';

      // Check metadata columns before date columns
      const firstDateColIdx = dateColumns[0]?.colIndex || 10;
      for (let c = 1; c < Math.min(row.length, firstDateColIdx); c++) {
        const cVal = String(row[c] || '').trim();
        if (parseShiftTime(cVal)) {
          shiftTime = cVal;
        }
        if (cVal.toUpperCase().includes('SAT') || cVal.toUpperCase().includes('SUN') || cVal.toUpperCase().includes('OFF')) {
          daysOff = cVal;
        }
      }

      // Count work shifts across the full bid date columns
      let workDaysCount = 0;
      dateColumns.forEach(col => {
        const cellVal = String(row[col.colIndex] || '').trim().toUpperCase();
        if (cellVal && !['OFF', 'X', '-', 'RDO', 'VAC', 'HOL', '0', ''].includes(cellVal)) {
          workDaysCount++;
        } else if (cellVal === 'X' && !daysOff.includes('X')) {
          workDaysCount++;
        }
      });

      const descParts = [
        role,
        skill,
        slots && !isNaN(Number(slots)) ? `${slots} slot${Number(slots) > 1 ? 's' : ''}` : '',
        shiftTime,
        daysOff
      ].filter(Boolean);

      lineRows.push({
        rowIndex: r,
        lineId: lineId.startsWith('Line') ? lineId : `Line ${lineId}`,
        role,
        skill,
        slots,
        description: descParts.join(' • ') || `Line entry ${lineId}`,
        shiftTime,
        daysOff,
        workDaysCount: workDaysCount || (dateColumns.length - Math.floor(dateColumns.length / 3))
      });
    }

    return {
      name: selectedSheetName,
      rows: rawRows,
      headerRowIndex: bestHeaderRowIndex,
      baseYear: initialDetectedYear,
      dayColumns: dateColumns,
      distinctMonths,
      lineRows
    };
  }, [workbook, selectedSheetName, baseYear]);

  // Sync detected base year
  useEffect(() => {
    if (parsedSheet?.baseYear) {
      setBaseYear(parsedSheet.baseYear);
    }
  }, [parsedSheet?.baseYear]);

  // Filtered lines based on user query
  const filteredLines = useMemo(() => {
    if (!parsedSheet) return [];
    if (!lineSearch.trim()) return parsedSheet.lineRows;
    const q = lineSearch.toLowerCase();
    return parsedSheet.lineRows.filter(l => 
      l.lineId.toLowerCase().includes(q) || 
      l.description.toLowerCase().includes(q) ||
      (l.role && l.role.toLowerCase().includes(q)) ||
      (l.skill && l.skill.toLowerCase().includes(q))
    );
  }, [parsedSheet, lineSearch]);

  // Active selected bid line
  const activeLine = useMemo(() => {
    if (!parsedSheet || selectedLineRowIndex === null) return null;
    return parsedSheet.lineRows.find(l => l.rowIndex === selectedLineRowIndex) || null;
  }, [parsedSheet, selectedLineRowIndex]);

  // Generate mapped calendar shifts for ONLY the dates that exist in the bid
  const mappedBidShifts = useMemo(() => {
    if (!parsedSheet || selectedLineRowIndex === null) return [];
    const targetRow = parsedSheet.rows[selectedLineRowIndex];
    if (!targetRow) return [];

    return parsedSheet.dayColumns.map(col => {
      const rawCellVal = String(targetRow[col.colIndex] || '').trim();
      const upperVal = rawCellVal.toUpperCase();

      const isExplicitOff = ['OFF', 'RDO', 'VAC', 'HOL', '-', '0', ''].includes(upperVal);
      const parsedTime = parseShiftTime(rawCellVal);

      let isWork = false;
      let shiftType = 'WORK-AM';
      let shiftHours = defaultShiftHours;
      let shiftLabel = defaultShiftTime;

      if (parsedTime) {
        isWork = true;
        shiftType = parsedTime.type;
        shiftHours = parsedTime.hrs;
        shiftLabel = parsedTime.label;
      } else if (!isExplicitOff && (upperVal === 'W' || upperVal === 'WORK' || upperVal === 'D' || upperVal === 'E' || upperVal === 'M' || upperVal === 'X' || !isNaN(Number(upperVal)))) {
        isWork = true;
        if (activeLine?.shiftTime) {
          const lineParsed = parseShiftTime(activeLine.shiftTime);
          if (lineParsed) {
            shiftType = lineParsed.type;
            shiftHours = lineParsed.hrs;
            shiftLabel = lineParsed.label;
          }
        }
      }

      return {
        dateStr: col.dateStr,
        year: col.year,
        month: col.month,
        day: col.day,
        dow: col.dow,
        monthName: MONTH_ABBR[col.month],
        isWork,
        type: shiftType,
        hrs: shiftHours,
        label: shiftLabel,
        rawCellVal
      };
    });
  }, [parsedSheet, selectedLineRowIndex, defaultShiftHours, defaultShiftTime, activeLine]);

  // Filter shifts for the preview grid
  const visiblePreviewShifts = useMemo(() => {
    if (previewMonthFilter === 'all') return mappedBidShifts;
    const [yStr, mStr] = previewMonthFilter.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    return mappedBidShifts.filter(s => s.year === y && s.month === m);
  }, [mappedBidShifts, previewMonthFilter]);

  // Summary counts
  const totalBidDays = mappedBidShifts.length;
  const totalWorkShifts = mappedBidShifts.filter(s => s.isWork).length;
  const totalScheduledHours = mappedBidShifts.reduce((acc, s) => s.isWork ? acc + s.hrs : acc, 0);

  // Date range description
  const bidRangeDescription = useMemo(() => {
    if (!parsedSheet || parsedSheet.dayColumns.length === 0) return '';
    const firstCol = parsedSheet.dayColumns[0];
    const lastCol = parsedSheet.dayColumns[parsedSheet.dayColumns.length - 1];
    return `${MONTH_ABBR[firstCol.month]} ${firstCol.day}, ${firstCol.year} – ${MONTH_ABBR[lastCol.month]} ${lastCol.day}, ${lastCol.year} (${parsedSheet.dayColumns.length} Days)`;
  }, [parsedSheet]);

  // Commit the ENTIRE bid line to application state in one click
  const handleConfirmImport = () => {
    if (!activeLine || mappedBidShifts.length === 0) return;

    const newLogs: LogsState = { ...logs };
    const bidDatesSet = new Set(mappedBidShifts.map(s => s.dateStr));

    // If replace mode, remove existing work shifts ONLY for the dates in this bid period
    if (replaceExistingBid) {
      Object.keys(newLogs).forEach(dateStr => {
        if (bidDatesSet.has(dateStr)) {
          newLogs[dateStr] = (newLogs[dateStr] || []).filter(e => !e.type.startsWith('WORK'));
        }
      });
    }

    let addedCount = 0;
    mappedBidShifts.forEach(shift => {
      if (!shift.isWork) return;

      const newEntry: LogEntry = {
        type: shift.type,
        hrs: shift.hrs,
        label: shift.label,
        prem: false,
        otRule: 'std'
      };

      if (!newLogs[shift.dateStr]) newLogs[shift.dateStr] = [];
      newLogs[shift.dateStr] = [...newLogs[shift.dateStr], newEntry];
      addedCount++;
    });

    const firstShift = mappedBidShifts[0];
    const monthsCount = parsedSheet?.distinctMonths.length || 1;

    onImportLogs(
      newLogs,
      firstShift.month,
      firstShift.year,
      `Successfully imported ${activeLine.lineId}: ${addedCount} shifts (${totalScheduledHours.toFixed(1)} hrs) across ${monthsCount} months (${bidRangeDescription})!`
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1050] p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--card-bg)] text-[var(--text-main)] w-full max-w-5xl rounded-2xl shadow-2xl border border-[var(--border-color)] overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-color)] bg-[var(--sub-bg)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] border border-[var(--swa-blue)]/20 shadow-xs">
              <CalendarRange size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Multi-Month Bid Importer
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-extrabold uppercase border border-[var(--swa-blue)]/20">
                  Entire Bid Package
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-[var(--text-muted)] font-medium">
                Imports your entire awarded bid line across all months in one click (no dates outside the bid).
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* File Selection Area */}
          {!workbook ? (
            <div className="border-2 border-dashed border-[var(--border-color)] hover:border-[var(--swa-blue)] rounded-2xl p-6 sm:p-10 text-center transition-all bg-[var(--hover-bg)]/40 flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] flex items-center justify-center mb-3 shadow-inner">
                <Upload size={26} />
              </div>
              <h3 className="text-sm sm:text-base font-black mb-1">Upload Your Excel Bid Sheet (.xlsx)</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mb-4 leading-relaxed">
                Upload your workbook containing your 3-month schedule bid package. Pick your tab and your specific bid line to import the full schedule.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-[var(--swa-blue)] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-sm hover:brightness-110 active:scale-95 transition cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  <span>Choose Excel File (.xlsx)</span>
                </button>

                <button
                  onClick={handleLoadDemoBidSheet}
                  className="px-4 py-2.5 bg-[var(--sub-bg)] border border-[var(--border-color)] text-[var(--text-main)] hover:border-[var(--swa-yellow)] font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs active:scale-95 transition cursor-pointer"
                  title="Test with an exact 3-month (Jan–Mar 2027) SWA bid package"
                >
                  <Sparkles size={14} className="text-[var(--swa-yellow)]" />
                  <span>Try Demo 3-Month SWA Bid Sheet</span>
                </button>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleFileUpload} 
              />

              {errorMessage && (
                <div className="mt-4 p-3 bg-[var(--swa-red)]/10 border border-[var(--swa-red)]/20 text-[var(--swa-red)] rounded-xl flex items-center gap-2 text-xs font-semibold">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[var(--sub-bg)] p-3 rounded-xl border border-[var(--border-color)] gap-2">
                <div className="flex items-center gap-2.5 truncate">
                  <FileSpreadsheet size={16} className="text-[var(--swa-blue)] flex-shrink-0" />
                  <span className="font-bold truncate text-xs">{fileName}</span>
                  <span className="text-[10px] text-[var(--text-muted)] hidden md:inline">
                    • {workbook.SheetNames.length} tabs
                  </span>
                  {bidRangeDescription && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-bold border border-[var(--swa-blue)]/20">
                      {bidRangeDescription}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] rounded-lg transition cursor-pointer"
                  >
                    Change File
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept=".xlsx, .xls, .csv" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </div>
              </div>

              {/* Step 1: Tab / Worksheet Selection */}
              <div>
                <label className="text-[11px] font-black uppercase text-[var(--text-muted)] mb-2 flex items-center gap-1.5 tracking-wider">
                  <Layers size={13} className="text-[var(--swa-blue)]" />
                  Step 1: Select Worksheet Tab
                </label>
                <div className="flex flex-wrap gap-2">
                  {workbook.SheetNames.map(sheetName => {
                    const isSelected = selectedSheetName === sheetName;
                    return (
                      <button
                        key={sheetName}
                        onClick={() => {
                          setSelectedSheetName(sheetName);
                          setSelectedLineRowIndex(null);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--swa-blue)] text-white border-[var(--swa-blue)] shadow-sm'
                            : 'bg-[var(--sub-bg)] text-[var(--text-main)] border-[var(--border-color)] hover:border-[var(--swa-blue)]/50 hover:bg-[var(--hover-bg)]'
                        }`}
                      >
                        <FileSpreadsheet size={13} className={isSelected ? 'text-white' : 'text-[var(--swa-blue)]'} />
                        <span>{sheetName}</span>
                        {isSelected && <Check size={12} className="text-white ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Bid Line (Row) Selection */}
              <div className="bg-[var(--sub-bg)] rounded-2xl p-4 border border-[var(--border-color)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <label className="text-[11px] font-black uppercase text-[var(--text-muted)] flex items-center gap-1.5 tracking-wider">
                      <Filter size={13} className="text-[var(--swa-blue)]" />
                      Step 2: Choose Your Awarded Bid Line (Row)
                    </label>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Select your line. All dates in this {parsedSheet?.distinctMonths.length || 3}-month bid will be prepared for import.
                    </p>
                  </div>

                  {/* Search / Filter line */}
                  <div className="relative min-w-[200px]">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Filter lines (e.g. 14, Provisioning)..."
                      value={lineSearch}
                      onChange={(e) => setLineSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--swa-blue)]"
                    />
                  </div>
                </div>

                {/* Lines Table */}
                <div className="border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--card-bg)] max-h-56 overflow-y-auto">
                  {filteredLines.length === 0 ? (
                    <div className="p-6 text-center text-[var(--text-muted)] text-xs italic">
                      No bid lines detected in this tab matching "{lineSearch}".
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[var(--sub-bg)] border-b border-[var(--border-color)] sticky top-0 text-[10px] uppercase font-black text-[var(--text-muted)] tracking-wider">
                        <tr>
                          <th className="p-2.5 w-10 text-center">Select</th>
                          <th className="p-2.5">Line #</th>
                          <th className="p-2.5">Role / Skill / Slots</th>
                          <th className="p-2.5 text-center">Bid Shifts</th>
                          <th className="p-2.5 text-right">Row</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-color)]">
                        {filteredLines.map((line) => {
                          const isSelected = selectedLineRowIndex === line.rowIndex;
                          return (
                            <tr
                              key={line.rowIndex}
                              onClick={() => setSelectedLineRowIndex(line.rowIndex)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-[var(--swa-blue)]/10 text-[var(--swa-blue)] font-bold'
                                  : 'hover:bg-[var(--hover-bg)]'
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <div className={`w-4 h-4 rounded-full border mx-auto flex items-center justify-center ${
                                  isSelected
                                    ? 'border-[var(--swa-blue)] bg-[var(--swa-blue)] text-white'
                                    : 'border-[var(--border-color)] bg-[var(--input-bg)]'
                                }`}>
                                  {isSelected && <Check size={10} />}
                                </div>
                              </td>
                              <td className="p-2.5 font-black whitespace-nowrap">
                                {line.lineId}
                              </td>
                              <td className="p-2.5 text-[var(--text-muted)] truncate max-w-[280px]">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {line.role && <span className="font-semibold text-[var(--text-main)]">{line.role}</span>}
                                  {line.skill && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--hover-bg)]">{line.skill}</span>}
                                  {line.slots && <span className="text-[10px] text-[var(--text-muted)]">{line.slots} slot</span>}
                                </div>
                              </td>
                              <td className="p-2.5 text-center font-bold">
                                <span className="px-2 py-0.5 rounded-md bg-[var(--hover-bg)] text-xs">
                                  {line.workDaysCount} shifts
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-mono text-[10px] text-[var(--text-muted)]">
                                #{line.rowIndex + 1}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Step 3: Shift Defaults (Fallback if sheet only has work markers) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-[var(--sub-bg)] p-4 rounded-2xl border border-[var(--border-color)]">
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-1 block">
                    Base Year
                  </label>
                  <input
                    type="number"
                    value={baseYear}
                    onChange={(e) => setBaseYear(parseInt(e.target.value, 10) || 2027)}
                    className="w-full p-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-xs font-black text-[var(--swa-blue)] font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-1 block">
                    Default Shift Time
                  </label>
                  <input
                    type="text"
                    value={defaultShiftTime}
                    onChange={(e) => setDefaultShiftTime(e.target.value)}
                    placeholder="e.g. 0600-1430"
                    className="w-full p-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-xs font-bold text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-1 block">
                    Shift Hours
                  </label>
                  <select
                    value={defaultShiftHours}
                    onChange={(e) => setDefaultShiftHours(parseFloat(e.target.value) || 8.0)}
                    className="w-full p-2 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-xs font-bold text-[var(--text-main)]"
                  >
                    <option value={8.0}>8.0 Hours (Standard)</option>
                    <option value={8.5}>8.5 Hours</option>
                    <option value={10.0}>10.0 Hours (4x10)</option>
                    <option value={4.0}>4.0 Hours (Part-Time)</option>
                    <option value={6.0}>6.0 Hours</option>
                  </select>
                </div>
              </div>

              {/* Step 4: Full Multi-Month Bid Schedule Preview */}
              {activeLine && (
                <div className="bg-[var(--card-bg)] p-4 rounded-2xl border border-[var(--border-color)] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CalendarRange size={16} className="text-[var(--swa-blue)]" />
                        <span className="font-black text-xs uppercase tracking-wider">
                          Full Bid Preview: {activeLine.lineId}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Only dates within your {totalBidDays}-day bid are displayed.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--pay-green)]/15 text-[var(--pay-green)] border border-[var(--pay-green)]/30">
                        {totalWorkShifts} Total Shifts
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-[var(--swa-blue)]/15 text-[var(--swa-blue)] border border-[var(--swa-blue)]/30 font-mono">
                        {totalScheduledHours.toFixed(1)} Total Hours
                      </span>
                    </div>
                  </div>

                  {/* Month Filter Selector */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] mr-1">View:</span>
                    <button
                      onClick={() => setPreviewMonthFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        previewMonthFilter === 'all'
                          ? 'bg-[var(--swa-blue)] text-white shadow-xs'
                          : 'bg-[var(--sub-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      All Bid Dates ({totalBidDays})
                    </button>
                    {parsedSheet?.distinctMonths.map(dm => {
                      const filterKey = `${dm.year}-${String(dm.month + 1).padStart(2, '0')}`;
                      const isSel = previewMonthFilter === filterKey;
                      return (
                        <button
                          key={filterKey}
                          onClick={() => setPreviewMonthFilter(filterKey)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            isSel
                              ? 'bg-[var(--swa-blue)] text-white shadow-xs'
                              : 'bg-[var(--sub-bg)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                          }`}
                        >
                          {dm.label} ({dm.count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Calendar Bid Day Badges Grid */}
                  <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-16 gap-1.5 max-h-60 overflow-y-auto p-1">
                    {visiblePreviewShifts.map((s) => (
                      <div
                        key={s.dateStr}
                        className={`p-1.5 rounded-lg border text-center transition-all flex flex-col justify-between min-h-[54px] ${
                          s.isWork
                            ? 'bg-[var(--swa-blue)]/15 border-[var(--swa-blue)]/40 text-[var(--swa-blue)] shadow-2xs font-bold'
                            : 'bg-[var(--sub-bg)] border-[var(--border-color)] text-[var(--text-muted)] opacity-60'
                        }`}
                        title={`${s.dateStr} (${s.dow}): ${s.isWork ? `${s.type} (${s.label}, ${s.hrs}h)` : 'OFF'}`}
                      >
                        <div className="flex items-center justify-between text-[8px] font-mono opacity-80 border-b border-black/10 dark:border-white/10 pb-0.5 mb-0.5">
                          <span>{s.monthName} {s.day}</span>
                          <span className="font-black">{s.dow}</span>
                        </div>
                        <span className="text-[9px] font-black truncate block my-auto">
                          {s.isWork ? s.label : 'OFF'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Replace Option Checkbox */}
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="replaceBid"
                      checked={replaceExistingBid}
                      onChange={(e) => setReplaceExistingBid(e.target.checked)}
                      className="rounded border-[var(--border-color)] text-[var(--swa-blue)] focus:ring-[var(--swa-blue)] cursor-pointer"
                    />
                    <label htmlFor="replaceBid" className="text-xs text-[var(--text-muted)] cursor-pointer select-none">
                      Replace any existing work shifts for the dates in this bid period ({bidRangeDescription}).
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-[var(--border-color)] bg-[var(--sub-bg)] flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] font-bold rounded-xl text-xs transition active:scale-95 cursor-pointer"
          >
            Cancel
          </button>

          {workbook && (
            <button
              onClick={handleConfirmImport}
              disabled={!activeLine}
              className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 shadow-md transition-all ${
                activeLine
                  ? 'bg-[var(--swa-blue)] text-white hover:brightness-110 active:scale-95 cursor-pointer'
                  : 'bg-[var(--hover-bg)] text-[var(--text-muted)] cursor-not-allowed opacity-60'
              }`}
            >
              <CheckCircle2 size={16} />
              <span>Import Entire {parsedSheet?.distinctMonths.length || 3}-Month Bid to Calendar ({totalWorkShifts} Shifts)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
