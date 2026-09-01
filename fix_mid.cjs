const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

const replacement = `const computeDayMidStats = (ds: string, logs: LogsState) => {
  let midHrs = 0;
  let shiftWopHrs = 0;
  
  const isMorningLabel = (l?: string) => l && (l.startsWith('00') || l.startsWith('01') || l.startsWith('02') || l.startsWith('03') || l.startsWith('04') || l.startsWith('05') || l.startsWith('06'));
  const isEveningLabel = (l?: string) => l && (l.startsWith('18') || l.startsWith('19') || l.startsWith('20') || l.startsWith('21') || l.startsWith('22') || l.startsWith('23'));
  const isWop = (type: string) => ['WOP', 'UNPAID-UNSCHED', 'UNPTO', 'TARDY', 'NO-SHOW', 'FMLA-U', 'FMLA-P'].includes(type);
  const isMid = (e: any) => e.type === 'WORK-MID' || e.type === 'WORK-SW3' || 
                  (e.label && (isEveningLabel(e.label) || isMorningLabel(e.label)) && (e.type.startsWith('WORK') || e.type === 'OT' || e.type === 'DT'));

  if (logs[ds] && Array.isArray(logs[ds])) {
    logs[ds].forEach(e => {
      if (isMid(e)) {
        const hrs = parseFloat(e.hrs as any);
        midHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 8;
      }
      if (isWop(e.type)) {
        const hrs = parseFloat(e.hrs as any);
        shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
      }
    });
  }
  
  if (midHrs === 0) return { midHrs, shiftWopHrs };

  // check next day morning and prev day evening
  const match = ds.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (match) {
    const current = new Date(parseInt(match[1], 10), parseInt(match[2], 10)-1, parseInt(match[3], 10));
    
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    const nextStr = \`\${next.getFullYear()}-\${String(next.getMonth() + 1).padStart(2, '0')}-\${String(next.getDate()).padStart(2, '0')}\`;
    if (logs[nextStr] && Array.isArray(logs[nextStr])) {
      logs[nextStr].forEach(e => {
        if (isWop(e.type) && isMorningLabel(e.label)) {
          const hrs = parseFloat(e.hrs as any);
          shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
        }
      });
    }
    
    const prev = new Date(current);
    prev.setDate(prev.getDate() - 1);
    const prevStr = \`\${prev.getFullYear()}-\${String(prev.getMonth() + 1).padStart(2, '0')}-\${String(prev.getDate()).padStart(2, '0')}\`;
    if (logs[prevStr] && Array.isArray(logs[prevStr])) {
      logs[prevStr].forEach(e => {
        if (isWop(e.type) && isEveningLabel(e.label)) {
          const hrs = parseFloat(e.hrs as any);
          shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
        }
      });
    }
  }

  return { midHrs, shiftWopHrs };
};

export const getAutoMidStatsForPeriod = (start: Date, end: Date, logs: LogsState, settings: Settings) => {
  let count = 0;
  let amt = 0;
  let dates: string[] = [];
  let current = new Date(start);
  current.setHours(0,0,0,0);
  const endD = new Date(end);
  endD.setHours(23,59,59,999);
  while (current <= endD) {
    const ds = \`\${current.getFullYear()}-\${String(current.getMonth() + 1).padStart(2, '0')}-\${String(current.getDate()).padStart(2, '0')}\`;
    const { level } = getEffectiveSalaryAndLevel(ds, settings);
    const defaultShiftRate = getMidRate(level);
    
    const { midHrs, shiftWopHrs } = computeDayMidStats(ds, logs);
    
    if (midHrs > 0) {
      if (shiftWopHrs > 0 || midHrs > 4) {
        count += 1;
        amt += defaultShiftRate;
        dates.push(ds + " (1)");
      } else {
        count += 0.5;
        amt += defaultShiftRate / 2;
        dates.push(ds + " (0.5)");
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  return { count, amt, dates };
};

export const getAutoMidStatsMonth = (y: number, m: number, logs: LogsState, settings: Settings) => {
  let count = 0;
  let amt = 0;
  let dates: string[] = [];
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d=1; d<=daysInMonth; d++) {
    const ds = \`\${y}-\${String(m+1).padStart(2,'0')}-\${String(d).padStart(2,'0')}\`;
    const { level } = getEffectiveSalaryAndLevel(ds, settings);
    const defaultShiftRate = getMidRate(level);
    
    const { midHrs, shiftWopHrs } = computeDayMidStats(ds, logs);
    
    if (midHrs > 0) {
      if (shiftWopHrs > 0 || midHrs > 4) {
        count += 1;
        amt += defaultShiftRate;
        dates.push(ds + " (1)");
      } else {
        count += 0.5;
        amt += defaultShiftRate / 2;
        dates.push(ds + " (0.5)");
      }
    }
  }
  return { count, amt, dates };
};
`;

const regex = /export const getAutoMidStatsForPeriod = [\s\S]*?return \{ count, amt, dates \};\n\};\n\nexport const getAutoMidStatsMonth = [\s\S]*?return \{ count, amt, dates \};\n\};/m;

code = code.replace(regex, replacement);

fs.writeFileSync('src/utils/calculations.ts', code);
