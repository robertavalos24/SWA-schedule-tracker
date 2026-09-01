import { LogEntry, FmlaCase, Settings, CardPrefs, LogsState, MidCountsState } from '../types';
import { autoAssignWorkedHolidays, isConsecutiveDtDay } from './calculations';

export const parseCSVLine = (text: string) => {
  const ret = []; let cur = ''; let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') inQuote = !inQuote;
    else if (char === ',' && !inQuote) { ret.push(cur.trim()); cur = ''; }
    else cur += char;
  }
  ret.push(cur.trim()); return ret;
};

export const formatStandardDate = (rawDateStr: string, viewYear: number) => {
  if(!rawDateStr) return null;
  let dateStr = rawDateStr.replace(/["\r]/g, '').trim().split(' ')[0]; 
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pName = dateStr.split('-');
  if (pName.length === 2 && isNaN(pName[1] as any)) {
    const mIndex = months.findIndex(m => pName[1].toLowerCase().startsWith(m.toLowerCase()));
    if (mIndex >= 0) return `${viewYear}-${String(mIndex + 1).padStart(2, '0')}-${String(pName[0]).padStart(2, '0')}`; 
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr.includes('-')) {
    const p = dateStr.split('-'); if(p.length === 3 && p[0].length <= 2) dateStr = dateStr.replace(/-/g, '/');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const slashes = dateStr.split('/');
  if (slashes.length === 3) {
    let y = slashes[2]; if (y.length === 2) y = "20" + y; 
    return `${y}-${slashes[0].padStart(2, '0')}-${slashes[1].padStart(2, '0')}`;
  }
  return null; 
};

export const exportCSV = async (logs: LogsState) => {
  let csv = "Date,Type,Hours,Premium,OT Rule\n";
  Object.keys(logs).sort().forEach(d => {
    if(!Array.isArray(logs[d])) return;
    logs[d].forEach(e => {
      let ruleStr = "Standard (1.5x)";
      let isDt = e.otRule === 'dt' || e.otRule === 'double';
      if (!isDt && isConsecutiveDtDay(d, logs)) {
        isDt = true;
      }
      if (isDt) ruleStr = "Double Time (2x)";
      csv += `${d},${e.type === 'OT' && isDt ? 'DT' : e.type},${e.hrs},${e.prem ? "Yes" : "No"},${ruleStr}\n`;
    });
  });

  const fileName = 'SWA_Schedule_Export.csv';

  // Try File System Access API first
  const isIframe = window.self !== window.top;
  if ('showSaveFilePicker' in window && !isIframe) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'CSV File',
          accept: { 'text/csv': ['.csv'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(csv);
      await writable.close();
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('File System Access API error:', err);
    }
  }

  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); 
  a.download = fileName; 
  a.click();
};

export const exportICS = (logs: LogsState) => {
  let icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SWA Schedule Builder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const escapeICS = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  };

  Object.keys(logs).sort().forEach(dateStr => {
    const entries = logs[dateStr];
    if (!entries || entries.length === 0) return;

    entries.forEach((e, idx) => {
      const dateOnly = dateStr.replace(/-/g, '');
      const summary = e.label ? `${e.type} - ${e.label}` : e.type;
      
      // Basic formatting for description
      let description = `Hours: ${e.hrs}${e.prem ? ' (Premium)' : ''}`;
      if (e.note) description += `\\nNote: ${e.note}`;

      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`DTSTAMP:${dtstamp}`);
      icsLines.push(`UID:${dateOnly}-${idx}@swa-schedule-builder`);
      icsLines.push(`SUMMARY:${escapeICS(summary)}`);
      icsLines.push(`DESCRIPTION:${escapeICS(description)}`);
      
      // Determine "Busy" vs "Free"
      const isOffBlock = e.type === 'PTO' || e.type === 'HOL' || e.type === 'WOP' || e.type.startsWith('FMLA') || e.type === 'HELD';
      icsLines.push(`TRANSP:${isOffBlock ? 'TRANSPARENT' : 'OPAQUE'}`);

      // Guess start time
      let startHour = -1;
      if (e.type === 'WORK-AM') startHour = 6;       // 6:00 AM
      else if (e.type === 'WORK-PM') startHour = 14; // 2:00 PM
      else if (e.type === 'WORK-MID') startHour = 22;// 10:00 PM
      else if (e.type === 'OT' || e.type === 'DT') {
        if (e.label?.toLowerCase().includes('pm')) startHour = 14;
        else if (e.label?.toLowerCase().includes('mid')) startHour = 22;
        else startHour = 6; // Default to AM
      }

      if (startHour !== -1) {
        // Timed Event
        const [y, m, d] = dateStr.split('-').map(Number);
        const startDate = new Date(y, m - 1, d, startHour, 0, 0);
        
        const durationHrs = parseFloat(String(e.hrs)) || 8;
        const endDate = new Date(startDate.getTime() + durationHrs * 60 * 60 * 1000);

        const formatDT = (dt: Date) => {
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
        };

        // Floating time keeps it attached to local time (so it doesn't shift unexpectedly if traveling)
        icsLines.push(`DTSTART:${formatDT(startDate)}`);
        icsLines.push(`DTEND:${formatDT(endDate)}`);

        // Add Alarm
        icsLines.push('BEGIN:VALARM');
        icsLines.push('ACTION:DISPLAY');
        icsLines.push(`DESCRIPTION:${escapeICS('Upcoming: ' + summary)}`);
        icsLines.push('TRIGGER:-PT1H'); // 1 hour before
        icsLines.push('END:VALARM');
      } else {
        // All-day Event
        const [y, m, d] = dateStr.split('-').map(Number);
        const startDate = new Date(y, m - 1, d);
        const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

        const formatD = (dt: Date) => {
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
        };

        icsLines.push(`DTSTART;VALUE=DATE:${formatD(startDate)}`);
        icsLines.push(`DTEND;VALUE=DATE:${formatD(endDate)}`);
      }

      icsLines.push('END:VEVENT');
    });
  });

  icsLines.push('END:VCALENDAR');

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const fileName = 'SWA_Schedule.ics';
  
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const exportBackup = async (logs: LogsState, midCounts: MidCountsState, settings: Settings, cardPrefs: CardPrefs, fmlaCases: FmlaCase[], stats?: any, attHistory?: any[], viewState?: { year: number, month: number }, theme?: string, isLocked?: boolean, lockedMonths?: string[]) => {
  const b = {
    logs, midCounts, settings, cardPrefs, fmlaCases,
    backup_metadata: {
      exported_at: new Date().toISOString(),
      app_version: "2.0",
      view_state: viewState,
      theme: theme,
      is_locked: isLocked,
      locked_months: lockedMonths || [],
      summary: stats,
      attendance_history: attHistory
    }
  };
  
  const jsonStr = JSON.stringify(b, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `v2.0 SCHED CAL ${dateStr}.json`;

  // Try File System Access API first (supported in Chrome, Edge, etc.)
  const isIframe = window.self !== window.top;
  if ('showSaveFilePicker' in window && !isIframe) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'JSON Backup File',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      return handle; // Return the handle so it can be reused
    } catch (err) {
      // If user cancels, just return
      if ((err as Error).name === 'AbortError') return null;
      console.error('File System Access API error:', err);
      // Fallback to standard download if API fails for other reasons
    }
  }

  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' })); 
  a.download = fileName; 
  a.click();
  return null;
};

export const saveToHandle = async (handle: any, logs: LogsState, midCounts: MidCountsState, settings: Settings, cardPrefs: CardPrefs, fmlaCases: FmlaCase[], stats?: any, attHistory?: any[], viewState?: { year: number, month: number }, theme?: string, isLocked?: boolean, lockedMonths?: string[]) => {
  const b = {
    logs, midCounts, settings, cardPrefs, fmlaCases,
    backup_metadata: {
      exported_at: new Date().toISOString(),
      app_version: "2.0",
      view_state: viewState,
      theme: theme,
      is_locked: isLocked,
      locked_months: lockedMonths || [],
      summary: stats,
      attendance_history: attHistory
    }
  };
  const jsonStr = JSON.stringify(b, null, 2);
  try {
    const writable = await handle.createWritable();
    await writable.write(jsonStr);
    await writable.close();
    return true;
  } catch (err) {
    console.error('Save to handle failed:', err);
    return false;
  }
};
