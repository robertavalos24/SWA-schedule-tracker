const logs = {
  '2026-07-19': [{ type: 'WORK-MID', label: '2200-0200', hrs: 4 }],
  '2026-07-20': [{ type: 'WOP', label: '0200-0600', hrs: 4 }, { type: 'WORK-MID', label: '2200-0600', hrs: 8 }]
};

const computeDayMidStats = (ds, logs) => {
  let midHrs = 0;
  let shiftWopHrs = 0;
  
  const isMorningLabel = (l) => l && (l.startsWith('00') || l.startsWith('01') || l.startsWith('02') || l.startsWith('03') || l.startsWith('04') || l.startsWith('05') || l.startsWith('06'));
  const isEveningLabel = (l) => l && (l.startsWith('18') || l.startsWith('19') || l.startsWith('20') || l.startsWith('21') || l.startsWith('22') || l.startsWith('23'));
  const isWop = (type) => ['WOP', 'UNPAID-UNSCHED', 'UNPTO', 'TARDY', 'NO-SHOW', 'FMLA-U', 'FMLA-P'].includes(type);
  const isMid = (e) => e.type === 'WORK-MID' || e.type === 'WORK-SW3' || 
                  (e.label && (isEveningLabel(e.label) || isMorningLabel(e.label)) && (e.type.startsWith('WORK') || e.type === 'OT' || e.type === 'DT'));

  if (logs[ds] && Array.isArray(logs[ds])) {
    logs[ds].forEach(e => {
      if (isMid(e)) {
        const hrs = parseFloat(e.hrs);
        midHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 8;
      }
      if (isWop(e.type)) {
        const hrs = parseFloat(e.hrs);
        shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
      }
    });
  }
  
  if (midHrs === 0) return { midHrs, shiftWopHrs };

  const match = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const current = new Date(parseInt(match[1], 10), parseInt(match[2], 10)-1, parseInt(match[3], 10));
    
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (logs[nextStr] && Array.isArray(logs[nextStr])) {
      logs[nextStr].forEach(e => {
        if (isWop(e.type) && isMorningLabel(e.label)) {
          const hrs = parseFloat(e.hrs);
          shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
        }
      });
    }
    
    const prev = new Date(current);
    prev.setDate(prev.getDate() - 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    if (logs[prevStr] && Array.isArray(logs[prevStr])) {
      logs[prevStr].forEach(e => {
        if (isWop(e.type) && isEveningLabel(e.label)) {
          const hrs = parseFloat(e.hrs);
          shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
        }
      });
    }
  }

  return { midHrs, shiftWopHrs };
};

console.log('19th:', computeDayMidStats('2026-07-19', logs));
console.log('20th:', computeDayMidStats('2026-07-20', logs));
