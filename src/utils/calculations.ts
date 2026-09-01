import { tiers, swaHolidays } from './constants';
import { LogEntry, Settings, LogsState, MidCountsState, RuleDef } from '../types';

export const getActiveRule = (targetDate: Date | string, settings?: any): any => {
  const defaultRule = {
    id: 'default',
    effectiveDate: '1900-01-01',
    rollingPeriodMonths: '12',
    dtThresholdTotalHrs: '12',
    dtThresholdOtHrs: '8'
  };
  
  if (!settings || !settings.rules || settings.rules.length === 0) return defaultRule;

  const tDate = typeof targetDate === 'string' ? targetDate : targetDate.toISOString().split('T')[0];
  
  const sorted = [...settings.rules].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  
  for (const rule of sorted) {
    if (rule.effectiveDate <= tDate) {
      return rule;
    }
  }
  
  return sorted[sorted.length - 1] || defaultRule;
};


export const formatPto = (val: number | string): string => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return "0.00";
  const str = num.toFixed(10).replace(/0+$/, '');
  if (str.endsWith('.')) return str + '00';
  if (str.split('.')[1].length === 1) return str + '0';
  return str;
};

export const getRawSalary = (salaryStr: string): number => {
  return parseFloat(salaryStr.replace(/[^0-9.-]+/g, "")) || 0;
};

export const getMidRate = (level: string): number => {
  if (level === 'P2') return 40;
  if (level === 'P3') return 50;
  if (level === 'P4') return 60;
  return 20; // Default P1
};

const reversedTiers = [...tiers].reverse();

export const getTier = (hireStr: string, targetY: number, targetM: number, empLevel: string) => {
  if (!hireStr) {
    if (empLevel === 'P3') return reversedTiers.find(t => t.y === 5) || tiers[0];
    return tiers[0];
  }
  
  const parts = hireStr.split('-');
  if (parts.length < 2) {
    if (empLevel === 'P3') return reversedTiers.find(t => t.y === 5) || tiers[0];
    return tiers[0];
  }
  
  const hy = parseInt(parts[0], 10);
  const hm = parseInt(parts[1], 10) - 1;
  
  if (isNaN(hy) || isNaN(hm)) {
    if (empLevel === 'P3') return reversedTiers.find(t => t.y === 5) || tiers[0];
    return tiers[0];
  }
  
  let diffY = targetY - hy;
  if (targetM <= hm) diffY--;
  let diff = Math.max(0, diffY);

  if (empLevel === 'P3' && diff < 10) {
    diff = 5;
  }

  return reversedTiers.find(t => diff >= t.y) || tiers[0];
};

const dtEligibleCache = new WeakMap<LogsState, Record<string, boolean>>();

export const isConsecutiveDtDay = (dateStr: string, logs: LogsState): boolean => {
  if (!logs) return false;
  
  let cacheForLogs = dtEligibleCache.get(logs);
  if (!cacheForLogs) {
    cacheForLogs = {};
    dtEligibleCache.set(logs, cacheForLogs);
  }
  
  if (cacheForLogs[dateStr] !== undefined) {
    return cacheForLogs[dateStr];
  }
  
  const currentLogs = logs[dateStr] || [];
  const hasStraightTime = currentLogs.some(l => l.type.startsWith('WORK-'));
  if (hasStraightTime) {
    cacheForLogs[dateStr] = false;
    return false;
  }

  let checkDate = new Date(dateStr + 'T12:00:00Z');
  checkDate.setDate(checkDate.getDate() - 1);

  const prevDateStr = checkDate.toISOString().split('T')[0];
  const prevLogs = logs[prevDateStr] || [];
  
  const prevHasStraightTime = prevLogs.some(l => l.type.startsWith('WORK-'));
  if (prevHasStraightTime) {
    cacheForLogs[dateStr] = false;
    return false;
  }

  const prevOtHrs = prevLogs.reduce((sum, l) => {
    if (l.type === 'OT' || l.type === 'DT') return sum + (parseFloat(l.hrs as any) || 0);
    return sum;
  }, 0);

  if (prevOtHrs > 0) {
    cacheForLogs[dateStr] = true;
    return true;
  }

  cacheForLogs[dateStr] = false;
  return false;
};

const computeDayMidStats = (ds: string, logs: LogsState) => {
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
        // Only include WOP on this day if it's NOT a morning label (which would belong to prev day)
        if (!isMorningLabel(e.label)) {
          const hrs = parseFloat(e.hrs as any);
          shiftWopHrs += (!isNaN(hrs) && hrs > 0) ? hrs : 0;
        }
      }
    });
  }
  
  if (midHrs === 0) return { midHrs, shiftWopHrs };

  // check next day morning
  const match = ds.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const current = new Date(parseInt(match[1], 10), parseInt(match[2], 10)-1, parseInt(match[3], 10));
    
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (logs[nextStr] && Array.isArray(logs[nextStr])) {
      logs[nextStr].forEach(e => {
        if (isWop(e.type) && isMorningLabel(e.label)) {
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
    const ds = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    const { level } = getEffectiveSalaryAndLevel(ds, settings);
    const defaultShiftRate = getMidRate(level);
    
    const { midHrs, shiftWopHrs } = computeDayMidStats(ds, logs);
    
    if (midHrs > 0) {
      const workedMidHrs = Math.min(midHrs, Math.max(0, 8 - shiftWopHrs));
      if (workedMidHrs > 0) {
        if (workedMidHrs > 4) {
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
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const { level } = getEffectiveSalaryAndLevel(ds, settings);
    const defaultShiftRate = getMidRate(level);
    
    const { midHrs, shiftWopHrs } = computeDayMidStats(ds, logs);
    
    if (midHrs > 0) {
      const workedMidHrs = Math.min(midHrs, Math.max(0, 8 - shiftWopHrs));
      if (workedMidHrs > 0) {
        if (workedMidHrs > 4) {
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
  }
  return { count, amt, dates };
};


export const getEffectiveSalaryAndLevel = (ds: string, settings: Settings) => {
  const targetDate = new Date(ds + "T00:00:00");
  let currentLevel = settings.empLevel;

  // 1. Pay History Source of Truth
  if (settings.payHistory && settings.payHistory.length > 0) {
    const sortedHistory = [...settings.payHistory].sort((a, b) => new Date(b.date + "T00:00:00").getTime() - new Date(a.date + "T00:00:00").getTime());
    
    let foundSal: number | null = null;
    let foundLevel: string | null = null;
    let lastEventDate: Date | null = null;

    for (const event of sortedHistory) {
      const eDate = new Date(event.date + "T00:00:00");
      if (targetDate >= eDate) {
        if (foundSal === null) {
          foundSal = getRawSalary(event.newSalary);
          lastEventDate = eDate;
        }
        if (foundLevel === null && event.level) foundLevel = event.level;
      }
      if (foundSal !== null && foundLevel !== null) break;
    }

    if (foundLevel === null) {
      const futureEvents = sortedHistory.filter(e => new Date(e.date + "T00:00:00") > targetDate).reverse();
      for (const event of futureEvents) {
        if (event.level) {
          if (event.type === 'Promotion') {
            const levelNum = parseInt(event.level.replace('P', ''), 10);
            if (!isNaN(levelNum) && levelNum > 1) {
              foundLevel = `P${levelNum - 1}`;
            } else {
              foundLevel = event.level;
            }
          } else {
            foundLevel = event.level;
          }
          break;
        }
      }
    }

    // Check promo level as fallback if not found in history but legacy promo is present
    if (foundLevel === null && settings.promoDate && settings.promoLevel) {
      const pDate = new Date(settings.promoDate + "T00:00:00");
      if (targetDate >= pDate) {
        foundLevel = settings.promoLevel;
      }
    }

    if (foundSal !== null && lastEventDate !== null) {
      let currentSal = foundSal;
      const pct = parseFloat(settings.pctIncrease) || 0;
      
      const year = lastEventDate.getFullYear();
      const lastEventWasBeforeMarch = lastEventDate.getMonth() < 2; 
      let nextMarch1stYear = lastEventWasBeforeMarch ? year : year + 1;
      
      while (true) {
        const march1st = new Date(nextMarch1stYear, 2, 1);
        if (march1st > lastEventDate && march1st <= targetDate) {
          currentSal = currentSal * (1 + (pct / 100));
          nextMarch1stYear++;
        } else {
          break;
        }
      }

      return { salary: currentSal, level: foundLevel || currentLevel };
    } else {
      // If no event is older than the target date, use the oldSalary of the oldest event
      const oldestEvent = sortedHistory[sortedHistory.length - 1];
      const fallbackSal = getRawSalary(oldestEvent.oldSalary || oldestEvent.newSalary);
      return { salary: fallbackSal, level: foundLevel || currentLevel };
    }
  }

  // 2. Legacy Fallback (compounding math)
  // Use initialSalary/Year if present, otherwise fallback to salary/baseYear
  const anchorSalary = settings.initialSalary || settings.salary;
  const anchorYear = settings.initialYear || settings.baseYear || "2026";
  
  let currentSal = getRawSalary(anchorSalary);
  const y = targetDate.getFullYear();
  const m = targetDate.getMonth();

  const baseYear = parseInt(anchorYear, 10);
  const startOfBaseYear = new Date(`${anchorYear}-01-01T00:00:00`);

  // 1. Standard Annual Increase (Compounding logic)
  const pct = parseFloat(settings.pctIncrease) || 0;
  // Calculate how many March 1sts have passed since March 1st of baseYear inclusive
  // Allow negative increases for traveling back in time
  const numIncreases = (y - baseYear) + (m >= 2 ? 1 : 0);
  if (numIncreases !== 0) {
    currentSal = currentSal * Math.pow(1 + (pct / 100), numIncreases);
  }

  // 2. Promotion (Overrides base/annual if date reached during target year or later)
  if (settings.promoDate) {
    const pDate = new Date(settings.promoDate + "T00:00:00");
    // Only apply if the promotion happens ON or AFTER the start of the base year (anchor)
    // and is on or before the target date.
    if (pDate >= startOfBaseYear) {
      if (targetDate >= pDate) {
        if (settings.promoSalary) currentSal = getRawSalary(settings.promoSalary);
        if (settings.promoLevel) currentLevel = settings.promoLevel;
      }
    }
  }

  // 3. Market Adjustment (Applies if date reached during target year or later)
  if (settings.adjDate && settings.adjValue) {
    const aDate = new Date(settings.adjDate + "T00:00:00");
    if (aDate >= startOfBaseYear) {
      if (targetDate >= aDate) {
        const val = settings.adjValue.trim();
        if (val.endsWith('%')) {
          const p = parseFloat(val.replace('%', '')) || 0;
          currentSal = currentSal * (1 + (p / 100));
        } else {
          const amt = getRawSalary(val);
          currentSal += amt;
        }
      }
    }
  }

  return { salary: currentSal, level: currentLevel };
};

export const getHrValForDate = (ds: string, settings: Settings) => {
  const { salary } = getEffectiveSalaryAndLevel(ds, settings);
  return salary / 2080;
};

const globalBalanceCache = new WeakMap<LogsState, { settingsKey: string, cache: Record<string, {pto: number, hol: number}> }>();

export const shouldAccrueInMonth = (y: number, m: number, logs: LogsState): boolean => {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}-`;
  let hasWork = false;
  let hasMed = false;

  for (const ds in logs) {
    if (ds.startsWith(prefix)) {
      if (logs[ds].some(e => e.type && e.type.startsWith('WORK'))) {
        hasWork = true;
      }
      if (logs[ds].some(e => e.type && (e.type.startsWith('MED-') || e.type === 'FMLA-P' || e.type === 'FML-UNP'))) {
        hasMed = true;
      }
    }
  }
  
  // If no work was performed and medical leave was present, don't accrue.
  // Otherwise, accrue as normal.
  if (!hasWork && hasMed) return false;
  return true;
};

export const getBalancesAtStartOfDate = (targetDs: string, logs: LogsState, settings: Settings, cache?: Record<string, {pto: number, hol: number}>, includeTargetAccrual: boolean = false) => {
  const asOfStr = settings.asOfDate;
  const corrDateStr = settings.correctionDate;
  
  if (!asOfStr && !corrDateStr) return { pto: parseFloat(settings.startPto) || 0, hol: 0 };

  const settingsKey = `${settings.hireDate}|${settings.asOfDate}|${settings.startPto}|${settings.correctionDate}|${settings.correctionStartPto}|${settings.empLevel}`;
  let activeCache = cache;
  
  if (!activeCache) {
    let cacheObj = globalBalanceCache.get(logs);
    if (!cacheObj || cacheObj.settingsKey !== settingsKey) {
      cacheObj = { settingsKey, cache: {} };
      globalBalanceCache.set(logs, cacheObj);
    }
    activeCache = cacheObj.cache;
  }

  if (activeCache && activeCache[targetDs] && !includeTargetAccrual) {
    return { ...activeCache[targetDs] };
  }

  const hStr = settings.hireDate;
  let ptoBal = parseFloat(settings.startPto) || 0;
  let holBal = 0;
  
  const target = new Date(targetDs + "T00:00:00");
  const asOf = asOfStr ? new Date(asOfStr + "T00:00:00") : new Date(2000, 0, 1);
  const corrDate = corrDateStr ? new Date(corrDateStr + "T00:00:00") : null;
  
  let baselineDate = asOf;
  // Note: We no longer reset baselineDate to corrDate to support additive corrections.
  // The cache handles the performance aspects.
  
  if (target < baselineDate) return { pto: ptoBal, hol: 0 };

  let current = new Date(baselineDate);
  
  // Find the closest cached date before target
  if (activeCache) {
    let closestCachedDate = new Date(baselineDate);
    let foundCache = false;
    
    // Check backwards from target to baselineDate
    let tempDate = new Date(target);
    tempDate.setDate(tempDate.getDate() - 1);
    
    while (tempDate >= baselineDate) {
      const cy = tempDate.getFullYear(), cm = tempDate.getMonth(), cd = tempDate.getDate();
      const ds = `${cy}-${String(cm+1).padStart(2,'0')}-${String(cd).padStart(2,'0')}`;
      if (activeCache[ds]) {
        ptoBal = activeCache[ds].pto;
        holBal = activeCache[ds].hol;
        closestCachedDate = new Date(tempDate);
        foundCache = true;
        break;
      }
      tempDate.setDate(tempDate.getDate() - 1);
    }
    
    if (foundCache) {
      current = new Date(closestCachedDate);
    }
  }

  let lastTierMonth = -1;
  let currentTier = getTier(hStr, current.getFullYear(), current.getMonth(), settings.empLevel);
  
    while (current < target) {
      const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();
      const ds = `${cy}-${String(cm+1).padStart(2,'0')}-${String(cd).padStart(2,'0')}`;
      
      if (corrDateStr && ds === corrDateStr) {
        ptoBal = parseFloat(settings.correctionStartPto) || 0;
      }
      
      if (cm !== lastTierMonth) {
        currentTier = getTier(hStr, cy, cm, settings.empLevel);
        lastTierMonth = cm;
      }

      let effectiveTier = { ...currentTier };
      if (settings.accrualChangeDate && ds >= settings.accrualChangeDate) {
        const customRate = parseFloat(settings.customAccrualRate);
        const customCap = parseFloat(settings.customAccrualCap);
        if (!isNaN(customRate)) effectiveTier.a = customRate;
        if (!isNaN(customCap)) effectiveTier.c = customCap;
      }
      
      // Accruals on the 1st
      if (cd === 1) {
        if (asOfStr && current.getTime() !== asOf.getTime() && current >= asOf) {
          let prevM = cm - 1;
          let prevY = cy;
          if (prevM < 0) {
            prevM = 11;
            prevY--;
          }
          const canAccrue = shouldAccrueInMonth(prevY, prevM, logs);
          if (canAccrue) {
            ptoBal += effectiveTier.a; 
          }
          if (cm <= 9) holBal += 8; // Jan-Oct
        }
      }
      
      // Process logs
      if (logs[ds] && Array.isArray(logs[ds])) {
        logs[ds].forEach(e => {
          const h = parseFloat(e.hrs as any) || 8;
          const isAfterAsOf = asOfStr && current >= asOf;

          if (e.type === 'HOL' && isAfterAsOf) {
            if (holBal >= h) {
              holBal -= h;
            } else {
              const remainingHol = Math.max(0, holBal);
              holBal = 0;
              const toPto = h - remainingHol;
              if (ptoBal >= toPto) {
                ptoBal -= toPto;
              } else {
                ptoBal = 0;
              }
            }
          } else if ((e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') && isAfterAsOf) {
            if (ptoBal >= h) {
              ptoBal -= h;
            } else {
              ptoBal = 0;
            }
          } else if (['TARDY', 'NO-SHOW'].includes(e.type) && isAfterAsOf) {
            const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
            const ptoDeduction = h - unp;
            if (ptoBal >= ptoDeduction) {
              ptoBal -= ptoDeduction;
            } else {
              ptoBal = 0;
            }
          }
        });
      }
      
      if (ptoBal > effectiveTier.c) ptoBal = effectiveTier.c;
    current.setDate(current.getDate() + 1);
    
    if (activeCache) {
      const nextCy = current.getFullYear(), nextCm = current.getMonth(), nextCd = current.getDate();
      const nextDs = `${nextCy}-${String(nextCm+1).padStart(2,'0')}-${String(nextCd).padStart(2,'0')}`;
      activeCache[nextDs] = { pto: ptoBal, hol: holBal };
    }
  }

  // Handle target day accrual if requested
  if (includeTargetAccrual) {
    const tCy = target.getFullYear(), tCm = target.getMonth(), tCd = target.getDate();
    const tDs = `${tCy}-${String(tCm+1).padStart(2,'0')}-${String(tCd).padStart(2,'0')}`;
    
    const targetTier = getTier(hStr, tCy, tCm, settings.empLevel);
    let effTargetTier = { ...targetTier };
    if (settings.accrualChangeDate && tDs >= settings.accrualChangeDate) {
      const customRate = parseFloat(settings.customAccrualRate);
      const customCap = parseFloat(settings.customAccrualCap);
      if (!isNaN(customRate)) effTargetTier.a = customRate;
      if (!isNaN(customCap)) effTargetTier.c = customCap;
    }
    
    if (tCd === 1) {
      if (asOfStr && target.getTime() !== asOf.getTime() && target >= asOf) {
        let prevM = tCm - 1;
        let prevY = tCy;
        if (prevM < 0) {
          prevM = 11;
          prevY--;
        }
        const canAccrue = shouldAccrueInMonth(prevY, prevM, logs);
        if (canAccrue) {
          ptoBal += effTargetTier.a;
        }
        if (tCm <= 9) holBal += 8;
      }
    }
    if (corrDateStr && targetDs === corrDateStr) {
      ptoBal = parseFloat(settings.correctionStartPto) || 0;
    }
    if (ptoBal > effTargetTier.c) {
      ptoBal = effTargetTier.c;
    }
  }
  
  if (activeCache && !includeTargetAccrual) {
    activeCache[targetDs] = { pto: ptoBal, hol: holBal };
  }
  
  return { pto: ptoBal, hol: holBal };
};

export const calculatePay = (y: number, m: number, day: number, logs: LogsState, midCounts: MidCountsState, settings: Settings) => {
  // Determine the date string for the midpoint of the pay period to get effective salary
  // Pay periods: 1-15 (paid on 20th), 16-end (paid on 5th next month)
  let refDateStr = "";
  if (day === 20) {
    refDateStr = `${y}-${String(m + 1).padStart(2, '0')}-08`; // Middle of 1-15
  } else {
    let prevM = m - 1; let prevY = y;
    if (prevM < 0) { prevM = 11; prevY = y - 1; }
    refDateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-23`; // Middle of 16-end
  }

  const { salary: currentSal, level: currentLevel } = getEffectiveSalaryAndLevel(refDateStr, settings);
  
  const basePay = currentSal / 24;
  const hrVal = currentSal / 2080;
  let extra = 0, loss = 0;
  
  let start: Date, end: Date;
  if (day === 20) {
    start = new Date(y, m, 1);
    end = new Date(y, m, 15);
  } else {
    let prevM = m - 1;
    let prevY = y;
    if (prevM < 0) { prevM = 11; prevY = y - 1; }
    start = new Date(prevY, prevM, 16);
    end = new Date(prevY, prevM + 1, 0); 
  }
  
  let otAmt = 0, dtAmt = 0, holPay = 0, totalLoss = 0, wopLoss = 0, fmlaUnpLoss = 0, infractionLoss = 0;
  let otHrs = 0, dtHrs = 0, holHrs = 0;
  let totalHrsWorked = 0, totalUnpaidHrs = 0;

  const mKey = y + '-' + m;
  let prevMForMid = m - 1; let prevYForMid = y;
  if (prevMForMid < 0) { prevMForMid = 11; prevYForMid = y - 1; }
  const prevMKey = prevYForMid + '-' + prevMForMid;

  let midCount = 0;
  let midAmt = 0;
  let midDates: string[] = [];
  if (day === 20) {
    const override = midCounts[mKey];
    const stats = getAutoMidStatsForPeriod(start, end, logs, settings);
    midDates = stats.dates;
    if (override !== undefined && override !== 'auto') {
      midCount = parseInt(override as string) / 2;
      midAmt = midCount > 0 ? (midCount * getMidRate(currentLevel)) : 0;
    } else {
      midCount = stats.count;
      midAmt = stats.amt;
    }
  } else if (day === 5) {
    const override = midCounts[prevMKey];
    const stats = getAutoMidStatsForPeriod(start, end, logs, settings);
    midDates = stats.dates;
    if (override !== undefined && override !== 'auto') {
      midCount = parseInt(override as string) / 2;
      midAmt = midCount > 0 ? (midCount * getMidRate(currentLevel)) : 0;
    } else {
      midCount = stats.count;
      midAmt = stats.amt;
    }
  }
  
  extra += midAmt;

  // Add STI Bonus to March 5th paycheck
  let stiAmt = 0;
  if (m === 2 && day === 5) {
    stiAmt = parseFloat(settings.stiBonus) || 0;
    extra += stiAmt;
  }

  let { pto: currentPto, hol: currentHol } = getBalancesAtStartOfDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`, logs, settings);

  let current = new Date(start);
  current.setHours(0,0,0,0);
  const endD = new Date(end);
  endD.setHours(23,59,59,999);
  while (current <= endD) {
    const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();
    const ds = `${cy}-${String(cm+1).padStart(2, '0')}-${String(cd).padStart(2, '0')}`;
    
    // Monthly accruals
    if (cd === 1) {
      const currentTier = getTier(settings.hireDate, cy, cm, settings.empLevel);
      let effTier = { ...currentTier };
      if (settings.accrualChangeDate && ds >= settings.accrualChangeDate) {
        const customRate = parseFloat(settings.customAccrualRate);
        const customCap = parseFloat(settings.customAccrualCap);
        if (!isNaN(customRate)) effTier.a = customRate;
        if (!isNaN(customCap)) effTier.c = customCap;
      }
      // Skip if it's the asOfDate (assuming startPto already includes it)
      if (settings.asOfDate !== ds) {
        let prevM = cm - 1;
        let prevY = cy;
        if (prevM < 0) {
          prevM = 11;
          prevY--;
        }
        const canAccrue = shouldAccrueInMonth(prevY, prevM, logs);
        if (canAccrue) {
          currentPto += effTier.a;
        }
        if (cm <= 9) currentHol += 8;
      }
      if (currentPto > effTier.c) currentPto = effTier.c;
    }

    if (logs[ds] && Array.isArray(logs[ds])) {
      const dayLogs = [...logs[ds]].map((e, idx) => ({...e, _origIdx: idx})).sort((a, b) => {
        const diff = getBlockStartHour(a) - getBlockStartHour(b);
        if (diff !== 0) return diff;
        return a._origIdx - b._origIdx;
      });
      const hasRegularShift = dayLogs.some(e => e.type.startsWith('WORK'));
      const hasTimeOff = dayLogs.some(e => ['PTO', 'FMLA-P', 'FML-UNP', 'MED-P', 'MED-UNP', 'UNPTO', 'HOL', 'WOP', 'UNPAID-UNSCHED', 'MED-P-PTO'].includes(e.type));
      const autoConj = hasRegularShift && !hasTimeOff;

      const totalWorkHrs = dayLogs.reduce((sum, log) => {
        if (log.type && (log.type === 'WORK' || log.type.startsWith('WORK-'))) {
          return sum + (parseFloat(log.hrs as any) || 0);
        }
        return sum;
      }, 0);

      let runningDailyTotal = totalWorkHrs;
      let runningDailyOtTotal = 0;

      dayLogs.forEach(e => {
        if(!e.type) return;
        const h = parseFloat(e.hrs as any) || 0;
        
        if (e.type.startsWith('WORK') || e.type === 'OT' || e.type === 'DT') {
          totalHrsWorked += h;
        }

        if (['WOP', 'UNPAID-UNSCHED'].includes(e.type)) {
          loss += (h * hrVal); wopLoss += (h * hrVal); totalLoss += (h * hrVal);
          totalUnpaidHrs += h;
        }
        if (e.type === 'FML-UNP' || e.type === 'MED-UNP') {
          loss += (h * hrVal); fmlaUnpLoss += (h * hrVal); totalLoss += (h * hrVal);
          totalUnpaidHrs += h;
        }
        if (['TARDY', 'NO-SHOW'].includes(e.type)) {
          const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
          if (unp > 0) {
            loss += (unp * hrVal); infractionLoss += (unp * hrVal); totalLoss += (unp * hrVal);
            totalUnpaidHrs += unp;
          }
          // PTO deduction for tardy/no-show
          const ptoDeduction = h - unp;
          if (currentPto >= ptoDeduction) {
            currentPto -= ptoDeduction;
          } else {
            const remainingPto = Math.max(0, currentPto);
            currentPto = 0;
            const toUnpaid = ptoDeduction - remainingPto;
            loss += (toUnpaid * hrVal); totalLoss += (toUnpaid * hrVal);
            totalUnpaidHrs += toUnpaid;
          }
        }
        
        if (e.type === 'HOL') {
          if (currentHol >= h) {
            currentHol -= h;
          } else {
            const remainingHol = Math.max(0, currentHol);
            currentHol = 0;
            const toPto = h - remainingHol;
            if (currentPto >= toPto) {
              currentPto -= toPto;
            } else {
              const remainingPto = Math.max(0, currentPto);
              currentPto = 0;
              const toUnpaid = toPto - remainingPto;
              loss += (toUnpaid * hrVal); totalLoss += (toUnpaid * hrVal);
              totalUnpaidHrs += toUnpaid;
            }
          }
        }

        if (e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') {
          if (currentPto >= h) {
            currentPto -= h;
          } else {
            const remainingPto = Math.max(0, currentPto);
            currentPto = 0;
            const toUnpaid = h - remainingPto;
            loss += (toUnpaid * hrVal); totalLoss += (toUnpaid * hrVal);
            totalUnpaidHrs += toUnpaid;
          }
        }

        if (e.type === 'HOL-W') { holPay += (h * hrVal); extra += (h * hrVal); holHrs += h; }
        if (e.type === 'OT' || e.type === 'DT') {
          const otMult = 1.5;
          const dtMult = 2.0;

          let isDt = e.type === 'DT' || e.otRule === 'dt' || e.otRule === 'double';
          if (!isDt && isConsecutiveDtDay(ds, logs)) {
            isDt = true;
          }
          
          let thisOt = 0, thisDt = 0;
          if (isDt) { 
            thisDt = h * hrVal * dtMult; dtAmt += thisDt; extra += thisDt; dtHrs += h;
          }
          else { 
            // Trigger DT after 12 total hours for the day OR 8 total OT hours for the day
            const rule = getActiveRule(new Date(y, m, day), settings);
            const dtTotalHrs = parseInt(rule.dtThresholdTotalHrs) || 12;
            const dtOtHrs = parseInt(rule.dtThresholdOtHrs) || 8;
            const remainingTo12Total = Math.max(0, dtTotalHrs - runningDailyTotal);
            const remainingTo8Ot = Math.max(0, dtOtHrs - runningDailyOtTotal);
            const splitAt = Math.min(remainingTo12Total, remainingTo8Ot);

            const otH = Math.min(h, splitAt);
            const dtH = Math.max(0, h - splitAt);
            thisOt = (otH * hrVal * otMult); 
            thisDt = (dtH * hrVal * dtMult); 
            otAmt += thisOt; dtAmt += thisDt; extra += (thisOt + thisDt); 
            otHrs += otH; dtHrs += dtH;
          }
          runningDailyTotal += h;
          runningDailyOtTotal += h;
        }
      });
    }

    current.setDate(current.getDate() + 1);
  }
  
  const gross = basePay + extra - loss;
  
  let k401Pct = parseFloat(settings.k401Pct) || 0;
  let insuranceAmt = parseFloat(settings.insuranceDed) || 0;
  
  try {
    let monthlyDeds = {};
    try { monthlyDeds = JSON.parse(settings.monthlyDeductions || '{}'); } catch(e) { console.warn('Failed to parse monthlyDeds', e); }
    const dedKey = `${y}-${m}`;
    if (monthlyDeds[dedKey]) {
      if (monthlyDeds[dedKey].k401Pct !== undefined) k401Pct = parseFloat(monthlyDeds[dedKey].k401Pct) || 0;
      if (monthlyDeds[dedKey].insuranceDed !== undefined) insuranceAmt = parseFloat(monthlyDeds[dedKey].insuranceDed) || 0;
    }
  } catch (e) {
    // Ignore parse error
  }

  const k401Ded = gross * (k401Pct / 100);

  let taxAmt = 0;
  let ficaAmt = 0;
  let fedTaxAmt = 0;
  let texasStateTaxAmt = 0;

  if (settings.enableTaxes === 'true') {
    // 1. FICA calculation: 7.65% of gross pay (Social Security 6.2%, Medicare 1.45%)
    ficaAmt = gross * 0.0765;

    // 2. Federal Income Tax calculation based on annualized wages
    if (settings.fedTaxExempt !== 'true') {
      const annualizedGross = gross * 24;
      const annualizedK401 = k401Ded * 24;
      const preTaxAnnualIncome = Math.max(0, annualizedGross - annualizedK401);

      // Standard deductions for tax filing status
      let stdDeduction = 15000;
      if (settings.taxFilingStatus === 'married') {
        stdDeduction = 30000;
      } else if (settings.taxFilingStatus === 'hoh') {
        stdDeduction = 22500;
      }

      const taxableIncome = Math.max(0, preTaxAnnualIncome - stdDeduction);

      // Compute marginal tax using standard tax brackets
      let annualFedTax = 0;
      if (settings.taxFilingStatus === 'married') {
        // Married Joint Brackets
        if (taxableIncome <= 23200) {
          annualFedTax = taxableIncome * 0.10;
        } else if (taxableIncome <= 94300) {
          annualFedTax = (23200 * 0.10) + (taxableIncome - 23200) * 0.12;
        } else if (taxableIncome <= 201050) {
          annualFedTax = (23200 * 0.10) + (71100 * 0.12) + (taxableIncome - 94300) * 0.22;
        } else {
          annualFedTax = (23200 * 0.10) + (71100 * 0.12) + (106750 * 0.22) + (taxableIncome - 201050) * 0.24;
        }
      } else if (settings.taxFilingStatus === 'hoh') {
        // Head of Household Brackets
        if (taxableIncome <= 16550) {
          annualFedTax = taxableIncome * 0.10;
        } else if (taxableIncome <= 63100) {
          annualFedTax = (16550 * 0.10) + (taxableIncome - 16550) * 0.12;
        } else if (taxableIncome <= 100500) {
          annualFedTax = (16550 * 0.10) + (46550 * 0.12) + (taxableIncome - 63100) * 0.22;
        } else {
          annualFedTax = (16550 * 0.10) + (46550 * 0.12) + (37400 * 0.22) + (taxableIncome - 100500) * 0.24;
        }
      } else {
        // Single Brackets
        if (taxableIncome <= 11600) {
          annualFedTax = taxableIncome * 0.10;
        } else if (taxableIncome <= 47150) {
          annualFedTax = (11600 * 0.10) + (taxableIncome - 11600) * 0.12;
        } else if (taxableIncome <= 100525) {
          annualFedTax = (11600 * 0.10) + (35550 * 0.12) + (taxableIncome - 47150) * 0.22;
        } else {
          annualFedTax = (11600 * 0.10) + (35550 * 0.12) + (53375 * 0.22) + (taxableIncome - 100525) * 0.24;
        }
      }

      // Child tax credit: $2000 per child/dependent
      const numChildren = parseInt(settings.taxDependents) || 0;
      const childCreditAllowance = numChildren * 2000;
      annualFedTax = Math.max(0, annualFedTax - childCreditAllowance);

      fedTaxAmt = annualFedTax / 24;
    }

    // Texas state tax rate: 0.00%
    texasStateTaxAmt = 0;

    taxAmt = ficaAmt + fedTaxAmt + texasStateTaxAmt;
  }

  const estimatedNet = gross - k401Ded - insuranceAmt - taxAmt;

  return { 
    net: gross, 
    basePay, 
    ot: otAmt, 
    dt: dtAmt, 
    holPay, 
    midAmt, 
    totalLoss, 
    wopLoss, 
    fmlaUnpLoss, 
    infractionLoss,
    otHrs,
    dtHrs,
    holHrs,
    midCount,
    stiAmt,
    totalHrsWorked,
    totalUnpaidHrs,
    level: currentLevel,
    k401Pct,
    k401Ded,
    insuranceAmt,
    taxAmt,
    ficaAmt,
    fedTaxAmt,
    texasStateTaxAmt,
    estimatedNet
  };
};

export const getOverallFmlaBalanceOnDate = (targetDs: string, logs: LogsState, fmlaCases: any[]): number => {
  let totalFmlaUsed = 0;
  let totalContinuousHours = 0;
  const target = new Date(targetDs + "T00:00:00");

  fmlaCases.forEach(c => {
    if ((c.leaveType === "Continuous" || c.isContinuous) && c.continuousWeeks) {
      totalContinuousHours += c.continuousWeeks * 40;
    }
  });

  for (const d in logs) {
    const dDate = new Date(d + "T00:00:00");
    if (dDate < target) {
      if (Array.isArray(logs[d])) {
        logs[d].forEach(e => {
          if ((e.type === 'FMLA-P' || e.type === 'FML-UNP')) {
            totalFmlaUsed += parseFloat(e.hrs as any) || 8;
          }
        });
      }
    }
  }
  
  return 480 - totalFmlaUsed - totalContinuousHours;
};

export const getFmlaBalanceOnDate = (targetDs: string, caseNum: string, logs: LogsState, fmlaCases: any[]): number => {
  const fmlaCase = fmlaCases.find(c => String(c.num) === String(caseNum));
  if (!fmlaCase) return 0;

  if ((fmlaCase.leaveType === "Continuous" || fmlaCase.isContinuous)) {
    return getOverallFmlaBalanceOnDate(targetDs, logs, fmlaCases);
  }

  let used = 0;
  const target = new Date(targetDs + "T00:00:00");

  for (const d in logs) {
    const dDate = new Date(d + "T00:00:00");
    // Only count usage up to the target date
    if (dDate < target) {
      if (Array.isArray(logs[d])) {
        logs[d].forEach(e => {
          if ((e.type === 'FMLA-P' || e.type === 'FML-UNP')) {
            if (fmlaCases.length <= 1 || String(e.fmlaCase) === String(caseNum)) {
              used += parseFloat(e.hrs as any) || 8;
            }
          }
        });
      }
    }
  }
  
  return (parseFloat(fmlaCase.bal as any) || 0) - used;
};

export const getFmlaMonthStats = (dateStr: string, fmlaCaseNum: string, currentLogs: LogsState, fmlaCases: any[], extraDate?: string) => {
  const [y, m] = dateStr.split('-');
  const daysInMonth = new Date(parseInt(y), parseInt(m), 0).getDate();
  
  let totalDays = 0;
  let episodes = 0;
  let currentEpisodeLength = 0;
  let maxEpisodeLength = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${m}-${String(d).padStart(2, '0')}`;
    
    let hasFmla = false;
    if (currentLogs[ds] && Array.isArray(currentLogs[ds])) {
      hasFmla = currentLogs[ds].some(e => 
        (e.type === 'FMLA-P' || e.type === 'FML-UNP') && 
        (fmlaCases.length <= 1 || String(e.fmlaCase) === String(fmlaCaseNum))
      );
    }
    if (ds === extraDate) {
      hasFmla = true;
    }

    if (hasFmla) {
      totalDays++;
      if (currentEpisodeLength === 0) {
        episodes++;
      }
      currentEpisodeLength++;
      if (currentEpisodeLength > maxEpisodeLength) {
        maxEpisodeLength = currentEpisodeLength;
      }
    } else {
      currentEpisodeLength = 0;
    }
  }

  return { totalDays, episodes, maxEpisodeLength };
};

export const processEntryWithBalances = (
  entry: any, 
  dateStr: string, 
  currentLogs: LogsState, 
  dayEntries: any[], 
  settings: Settings,
  fmlaCases: any[],
  editIndex: number | null = null
): { entries: any[], warning: string } => {
  let warning = '';
  let entriesToAdd: any[] = [{ ...entry }];
  
  // 1. Check FMLA Frequency and Balance
  if (entry.type === 'FMLA-P' || entry.type === 'FML-UNP') {
    const reqHrs = parseFloat(entry.hrs as any) || 8;
    const fmlaCase = fmlaCases.find(c => String(c.num) === String(entry.fmlaCase)) || fmlaCases[0];
    
    // Check Frequency
    let frequencyExceeded = false;
    if (fmlaCase && fmlaCase.freqEpi && fmlaCase.freqDays) {
      const stats = getFmlaMonthStats(dateStr, entry.fmlaCase, currentLogs, fmlaCases, dateStr);

      if ((fmlaCase.leaveType === "Continuous" || fmlaCase.isContinuous)) {
        if (stats.episodes > fmlaCase.freqEpi || stats.maxEpisodeLength > fmlaCase.freqDays) {
          frequencyExceeded = true;
        }
      } else {
        const maxDays = fmlaCase.freqEpi * fmlaCase.freqDays;
        if (stats.totalDays > maxDays) {
          frequencyExceeded = true;
        }
      }
    }

    if (frequencyExceeded) {
      entriesToAdd = [];
      const unptoEntry = { ...entry, type: 'UNPTO', hrs: reqHrs };
      delete unptoEntry.fmlaCase;
      entriesToAdd.push(unptoEntry);
      warning = `FMLA frequency exceeded for this month (Case #${fmlaCase.num}). The ${reqHrs} hours have been converted to UNPTO.`;
    } else {
      // Check Balance
      const fmlaBal = getFmlaBalanceOnDate(dateStr, entry.fmlaCase, currentLogs, fmlaCases);
      let fmlaUsedToday = 0;
      dayEntries.forEach((e, idx) => {
        if (idx !== editIndex) {
          if (e.type === 'FMLA-P' || e.type === 'FML-UNP') {
            if (fmlaCases.length <= 1 || String(e.fmlaCase) === String(entry.fmlaCase)) {
              fmlaUsedToday += parseFloat(e.hrs as any) || 8;
            }
          }
        }
      });
      const availableFmla = fmlaBal - fmlaUsedToday;
      
      if (availableFmla < reqHrs) {
        entriesToAdd = [];
        if (availableFmla > 0) {
          entriesToAdd.push({ ...entry, hrs: availableFmla });
          const unptoEntry = { ...entry, type: 'UNPTO', hrs: reqHrs - availableFmla };
          delete unptoEntry.fmlaCase;
          entriesToAdd.push(unptoEntry);
          warning = `Insufficient FMLA balance (Case #${fmlaCase.num}). You only had ${formatPto(availableFmla)} hours available. The remaining ${formatPto(reqHrs - availableFmla)} hours have been converted to UNPTO.`;
        } else {
          const unptoEntry = { ...entry, type: 'UNPTO', hrs: reqHrs };
          delete unptoEntry.fmlaCase;
          entriesToAdd.push(unptoEntry);
          warning = `No FMLA balance available (Case #${fmlaCase.num}). The ${reqHrs} hours have been converted to UNPTO.`;
        }
      }
    }
  }

  // 2. Check PTO and HOL Balances
  const finalEntries: any[] = [];
  
  const { pto: currentPtoBal, hol: currentHolBal } = getBalancesAtStartOfDate(dateStr, currentLogs, settings, undefined, true);
  
  let ptoUsedToday = 0;
  let holUsedToday = 0;
  dayEntries.forEach((e, idx) => {
    if (idx !== editIndex) {
      if (e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') {
        ptoUsedToday += parseFloat(e.hrs as any) || 8;
      } else if (['TARDY', 'NO-SHOW'].includes(e.type)) {
        const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : (parseFloat(e.hrs as any) || 8);
        ptoUsedToday += (parseFloat(e.hrs as any) || 8) - unp;
      } else if (e.type === 'HOL') {
        holUsedToday += parseFloat(e.hrs as any) || 8;
      }
    }
  });
  
  let availablePto = currentPtoBal - ptoUsedToday;
  let availableHol = currentHolBal - holUsedToday;

  for (const ent of entriesToAdd) {
    if (ent.type === 'HOL') {
      const h = parseFloat(ent.hrs as any) || 8;
      if (availableHol >= h) {
        availableHol -= h;
        finalEntries.push(ent);
      } else {
        const remainingHol = Math.max(0, availableHol);
        availableHol = 0;
        if (remainingHol > 0) finalEntries.push({ ...ent, hrs: remainingHol });
        
        const toPto = h - remainingHol;
        if (availablePto >= toPto) {
          availablePto -= toPto;
          finalEntries.push({ ...ent, type: 'PTO', hrs: toPto });
          warning += (warning ? ' ' : '') + `Insufficient HOL. ${formatPto(toPto)} hours converted to PTO.`;
        } else {
          const remainingPto = Math.max(0, availablePto);
          availablePto = 0;
          if (remainingPto > 0) finalEntries.push({ ...ent, type: 'PTO', hrs: remainingPto });
          
          const toUnpaid = toPto - remainingPto;
          finalEntries.push({ ...ent, type: 'UNPAID-UNSCHED', hrs: toUnpaid });
          warning += (warning ? ' ' : '') + `Insufficient HOL and PTO. ${toUnpaid.toFixed(2)} hours converted to UNPAID-UNSCHED.`;
        }
      }
      } else if (ent.type === 'PTO' || ent.type === 'FMLA-P' || ent.type === 'UNPTO' || ent.type === 'MED-P-PTO') {
      const reqHrs = parseFloat(ent.hrs as any) || 8;
      if (availablePto < reqHrs) {
        const fallbackType = ent.type === 'FMLA-P' ? 'FML-UNP' : 'UNPAID-UNSCHED';
        if (availablePto > 0) {
          finalEntries.push({ ...ent, hrs: availablePto });
          const fallbackEntry = { ...ent, type: fallbackType, hrs: reqHrs - availablePto };
          if (fallbackType !== 'FML-UNP') delete fallbackEntry.fmlaCase;
          finalEntries.push(fallbackEntry);
          
          warning += (warning ? ' ' : '') + `You only had ${availablePto.toFixed(2)} hours of PTO available. The remaining ${(reqHrs - availablePto).toFixed(2)} hours have been added as ${fallbackType} and will account for attendance points.`;
          availablePto = 0;
        } else {
          const fallbackEntry = { ...ent, type: fallbackType, hrs: reqHrs };
          if (fallbackType !== 'FML-UNP') delete fallbackEntry.fmlaCase;
          finalEntries.push(fallbackEntry);
          
          warning += (warning ? ' ' : '') + `You have no PTO available. The ${reqHrs} hours have been added as ${fallbackType} and will account for attendance points.`;
        }
      } else {
        finalEntries.push(ent);
        availablePto -= reqHrs;
      }
    } else {
      finalEntries.push(ent);
    }
  }

  return { entries: finalEntries, warning };
};

export const getAutoStiStats = (perfYear: number, settings: Settings) => {
  const isLeapYear = (perfYear % 4 === 0 && perfYear % 100 !== 0) || (perfYear % 400 === 0);
  const daysInYear = isLeapYear ? 366 : 365;
  
  let totalPct = 0;
  let totalSalary = 0;

  const periods: { startDs: string, endDs: string, days: number, salary: number, level: string, pct: number }[] = [];
  let currentPeriod: any = null;

  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(perfYear, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${perfYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const { salary, level } = getEffectiveSalaryAndLevel(ds, settings);
      
      let pct = 0;
      if (level === 'P2') pct = 4;
      else if (level === 'P3' || level === 'P4') pct = 5;
      
      totalPct += pct;
      totalSalary += salary;

      if (!currentPeriod || currentPeriod.salary !== salary || currentPeriod.level !== level) {
        if (currentPeriod) {
          periods.push(currentPeriod);
        }
        currentPeriod = {
          startDs: ds,
          endDs: ds,
          days: 1,
          salary,
          level,
          pct
        };
      } else {
        currentPeriod.endDs = ds;
        currentPeriod.days += 1;
      }
    }
  }

  if (currentPeriod) {
    periods.push(currentPeriod);
  }

  return {
    effectiveBaseSalary: totalSalary / daysInYear,
    effectiveBonusPct: totalPct / daysInYear,
    daysInYear,
    periods
  };
};

export const getPtoBalanceOnDate = (targetDs: string, logs: LogsState, settings: Settings): number => {
  const { pto } = getBalancesAtStartOfDate(targetDs, logs, settings, undefined, true);
  return pto;
};

export const calculate = (y: number, m: number, logs: LogsState, midCounts: MidCountsState, settings: Settings, skipPayCalculations: boolean = false, cache?: Record<string, {pto: number, hol: number}>) => {
  const hStr = settings.hireDate;
  const asOfStr = settings.asOfDate;
  
  const startOfMonthDs = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const { pto: ptoStart, hol: holStart } = getBalancesAtStartOfDate(startOfMonthDs, logs, settings, cache);
  
  let ptoEnd = ptoStart;
  let holEnd = holStart;
  
  let current = new Date(y, m, 1);
  const targetEnd = new Date(y, m + 1, 0);
  
  let lastTierMonth = -1;
  let currentTier = getTier(hStr, current.getFullYear(), current.getMonth(), settings.empLevel);
  let lastEffectiveTier = { ...currentTier };
  
  let uuCount = 0;
  
  while (current <= targetEnd) {
    const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();
    const ds = `${cy}-${String(cm+1).padStart(2,'0')}-${String(cd).padStart(2,'0')}`;
    
    if (cm !== lastTierMonth) {
      currentTier = getTier(hStr, cy, cm, settings.empLevel);
      lastTierMonth = cm;
    }
    
    let effectiveTier = { ...currentTier };
    if (settings.accrualChangeDate && ds >= settings.accrualChangeDate) {
      const customRate = parseFloat(settings.customAccrualRate);
      const customCap = parseFloat(settings.customAccrualCap);
      if (!isNaN(customRate)) effectiveTier.a = customRate;
      if (!isNaN(customCap)) effectiveTier.c = customCap;
    }
    lastEffectiveTier = { ...effectiveTier };
    
    if (settings.correctionDate && ds === settings.correctionDate) {
      ptoEnd = parseFloat(settings.correctionStartPto) || 0;
    }

    if (cd === 1) { 
      if (asOfStr && ds !== asOfStr && current >= new Date(asOfStr + "T00:00:00")) {
        let prevM = cm - 1;
        let prevY = cy;
        if (prevM < 0) {
          prevM = 11;
          prevY--;
        }
        const canAccrue = shouldAccrueInMonth(prevY, prevM, logs);
        if (canAccrue) {
          ptoEnd += effectiveTier.a;
        }
        if (cm <= 9) holEnd += 8;
      }
    }
    
    if (logs[ds] && Array.isArray(logs[ds])) {
      logs[ds].forEach(e => {
        const h = parseFloat(e.hrs as any) || 8;
        const isAfterAsOf = asOfStr && current >= new Date(asOfStr + "T00:00:00");

        if (e.type === 'HOL' && isAfterAsOf) {
          if (holEnd >= h) {
            holEnd -= h;
          } else {
            const remainingHol = Math.max(0, holEnd);
            holEnd = 0;
            const toPto = h - remainingHol;
            if (ptoEnd >= toPto) {
              ptoEnd -= toPto;
            } else {
              const remainingPto = Math.max(0, ptoEnd);
              ptoEnd = 0;
              const toUnpaid = toPto - remainingPto;
              if (toUnpaid > 0) uuCount++;
            }
          }
        } else if ((e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') && isAfterAsOf) {
          if (ptoEnd >= h) {
            ptoEnd -= h;
          } else {
            const remainingPto = Math.max(0, ptoEnd);
            ptoEnd = 0;
            const toUnpaid = h - remainingPto;
            if (toUnpaid > 0) uuCount++;
          }
        } else if (['TARDY', 'NO-SHOW'].includes(e.type) && isAfterAsOf) {
          const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
          const ptoDeduction = h - unp;
          if (ptoEnd >= ptoDeduction) {
            ptoEnd -= ptoDeduction;
          } else {
            const remainingPto = Math.max(0, ptoEnd);
            ptoEnd = 0;
            const toUnpaid = ptoDeduction - remainingPto;
            if (toUnpaid > 0) uuCount++;
          }
        } else if (e.type === 'UNPAID-UNSCHED') {
          uuCount++;
        }
      });
    }
    
    if (ptoEnd > effectiveTier.c) ptoEnd = effectiveTier.c;
    current.setDate(current.getDate() + 1);
  }
  
  const mKey = y + '-' + m;
  let midMonthCount: number | string = midCounts[mKey];
  let midMonthAmt = 0;
  
  if (midMonthCount === undefined || midMonthCount === 'auto') {
    const stats = getAutoMidStatsMonth(y, m, logs, settings);
    midMonthCount = stats.count;
    midMonthAmt = stats.amt;
  } else {
    midMonthCount = parseInt(midMonthCount as string);
    const { level: endOfMonthLevel } = getEffectiveSalaryAndLevel(`${y}-${String(m+1).padStart(2,'0')}-28`, settings);
    midMonthAmt = midMonthCount * getMidRate(endOfMonthLevel);
  }
  
  let midYearAmt = 0;
  if (!skipPayCalculations) {
    for(let i=0; i<12; i++) {
      const mk = y + '-' + i;
      let mdc = midCounts[mk];
      if (mdc === undefined || mdc === 'auto') {
        midYearAmt += getAutoMidStatsMonth(y, i, logs, settings).amt;
      } else {
        const { level: endOfMonthLevel } = getEffectiveSalaryAndLevel(`${y}-${String(i+1).padStart(2,'0')}-28`, settings);
        midYearAmt += parseInt(mdc as string) * getMidRate(endOfMonthLevel);
      }
    }
  }

  let yg = 0, otYearAmt = 0, dtYearAmt = 0, holYearPay = 0, wopYearLoss = 0, fmlaUnpYearLoss = 0, infractionYearLoss = 0, totalYearLoss = 0;
  let k401YearDed = 0, insuranceYearAmt = 0, estimatedNetYear = 0;
  if (!skipPayCalculations) {
    for(let mo=0; mo<12; mo++) {
      const p5 = calculatePay(y, mo, 5, logs, midCounts, settings), p20 = calculatePay(y, mo, 20, logs, midCounts, settings);
      yg += (p5.net || 0) + (p20.net || 0); 
      otYearAmt += (p5.ot || 0) + (p20.ot || 0); 
      dtYearAmt += (p5.dt || 0) + (p20.dt || 0); 
      holYearPay += (p5.holPay || 0) + (p20.holPay || 0); 
      wopYearLoss += (p5.wopLoss || 0) + (p20.wopLoss || 0);
      fmlaUnpYearLoss += (p5.fmlaUnpLoss || 0) + (p20.fmlaUnpLoss || 0);
      infractionYearLoss += (p5.infractionLoss || 0) + (p20.infractionLoss || 0);
      k401YearDed += (p5.k401Ded || 0) + (p20.k401Ded || 0);
      insuranceYearAmt += (p5.insuranceAmt || 0) + (p20.insuranceAmt || 0);
      estimatedNetYear += (p5.estimatedNet || 0) + (p20.estimatedNet || 0);
    }
  }
  totalYearLoss = wopYearLoss + fmlaUnpYearLoss + infractionYearLoss;
  
  const sti = parseFloat(settings.stiBonus) || 0;

  return { ptoStart, ptoEnd, holStart, holEnd, midMonthCount, midMonthAmt, midYearAmt, yg, otYearAmt, dtYearAmt, holYearPay, wopYearLoss, fmlaUnpYearLoss, infractionYearLoss, totalYearLoss, currentTier: lastEffectiveTier, sti, uuCount, k401YearDed, insuranceYearAmt, estimatedNetYear };
};

export const getRollingYearStats = (y: number, m: number, logs: LogsState, settings: Settings, asOfDate?: Date) => {
  const endTarget = asOfDate ? new Date(asOfDate) : new Date(y, m + 1, 0);
  endTarget.setHours(0,0,0,0);
  
  const rule = getActiveRule(endTarget, settings);
  const monthsStr = rule.rollingPeriodMonths || '12';
  const rollingMonths = parseInt(monthsStr) || 12;
  const startTarget = asOfDate 
    ? new Date(asOfDate.getFullYear(), asOfDate.getMonth() - rollingMonths, asOfDate.getDate() + 1)
    : new Date(y, m - rollingMonths + 1, 1);
  startTarget.setHours(0,0,0,0);
  
  let unptoHrs = 0, uuCount = 0, tardyCount = 0, nsCount = 0;
  const attHistory: any[] = [];
  
  const startOfMonthDs = `${startTarget.getFullYear()}-${String(startTarget.getMonth() + 1).padStart(2, '0')}-01`;
  const { pto: ptoStart, hol: holStart } = getBalancesAtStartOfDate(startOfMonthDs, logs, settings);
  
  let pto = ptoStart;
  let hol = holStart;
  
  let current = new Date(startTarget.getFullYear(), startTarget.getMonth(), 1);
  const hStr = settings.hireDate;
  const asOfStr = settings.asOfDate;
  
  let lastTierMonth = -1;
  let currentTier = getTier(hStr, current.getFullYear(), current.getMonth(), settings.empLevel);

  while (current <= endTarget) {
    const cy = current.getFullYear(), cm = current.getMonth(), cd = current.getDate();
    const ds = `${cy}-${String(cm+1).padStart(2,'0')}-${String(cd).padStart(2,'0')}`;
    
    if (cm !== lastTierMonth) {
      currentTier = getTier(hStr, cy, cm, settings.empLevel);
      lastTierMonth = cm;
    }
    
    let effectiveTier = { ...currentTier };
    if (settings.accrualChangeDate && ds >= settings.accrualChangeDate) {
      const customRate = parseFloat(settings.customAccrualRate);
      const customCap = parseFloat(settings.customAccrualCap);
      if (!isNaN(customRate)) effectiveTier.a = customRate;
      if (!isNaN(customCap)) effectiveTier.c = customCap;
    }
    
    if (settings.correctionDate && ds === settings.correctionDate) {
      pto = parseFloat(settings.correctionStartPto) || 0;
    }

    if (cd === 1 && ds !== asOfStr) { 
      const isAfterAsOf = !asOfStr || ds >= asOfStr;
      if (isAfterAsOf) {
        let prevM = cm - 1;
        let prevY = cy;
        if (prevM < 0) {
          prevM = 11;
          prevY--;
        }
        const canAccrue = shouldAccrueInMonth(prevY, prevM, logs);
        if (canAccrue) {
          pto += effectiveTier.a;
        }
        if (cm <= 9) hol += 8;
      }
    }
    
    if (logs[ds] && Array.isArray(logs[ds])) {
      logs[ds].forEach(e => {
        const h = parseFloat(e.hrs as any) || 8;
        let isUu = false;
        let isUnpto = false;
        let isTardy = false;
        let isNs = false;
        let val = "";
        
        const isAfterAsOf = !asOfStr || ds >= asOfStr;

        if (e.type === 'HOL') {
          if (isAfterAsOf) {
            if (hol >= h) {
              hol -= h;
            } else {
              const remainingHol = Math.max(0, hol);
              hol = 0;
              const toPto = h - remainingHol;
              if (pto >= toPto) {
                pto -= toPto;
              } else {
                pto = 0;
              }
            }
          }
        } else if (e.type === 'PTO' || e.type === 'FMLA-P' || e.type === 'UNPTO' || e.type === 'MED-P-PTO') {
          if (e.type === 'UNPTO') {
            if (isAfterAsOf) {
              if (pto >= h) {
                pto -= h;
                isUnpto = true;
                val = h + 'h';
              } else {
                const remainingPto = Math.max(0, pto);
                pto = 0;
                isUu = true;
                val = '1 inst (Auto)';
              }
            } else {
              isUnpto = true;
              val = h + 'h';
            }
          } else {
            if (isAfterAsOf) {
              if (pto >= h) {
                pto -= h;
              } else {
                pto = 0;
              }
            }
          }
        } else if (['TARDY', 'NO-SHOW'].includes(e.type)) {
          if (e.type === 'TARDY') isTardy = true;
          if (e.type === 'NO-SHOW') isNs = true;
          val = '1 inst';
          
          if (isAfterAsOf) {
            const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
            const ptoDeduction = h - unp;
            if (pto >= ptoDeduction) {
              pto -= ptoDeduction;
            } else {
              pto = 0;
            }
          }
        } else if (e.type === 'UNPAID-UNSCHED') {
          isUu = true;
          val = '1 inst';
        }

        const logDate = new Date(ds + "T00:00:00");
        if (logDate >= startTarget && logDate <= endTarget) {
          if (isUnpto) { unptoHrs += h; attHistory.push({date: ds, type: 'UNPTO', val}); }
          if (isUu) { uuCount++; attHistory.push({date: ds, type: 'UNPAID-UNSCHED', val}); }
          if (isTardy) { tardyCount++; attHistory.push({date: ds, type: 'TARDY', val}); }
          if (isNs) { nsCount++; attHistory.push({date: ds, type: 'NO-SHOW', val}); }
        }
      });
    }
    
    if (pto > effectiveTier.c) pto = effectiveTier.c;
    current.setDate(current.getDate() + 1);
  }

  attHistory.sort((a,b) => a.date.localeCompare(b.date));
  return { unptoHrs, uuCount, tardyCount, nsCount, attHistory };
};

export const getBlockStartHour = (e: LogEntry) => {
  if (e.label) {
    const m = e.label.match(/(?:^|\s)(\d{2})/);
    if (m) {
      return parseInt(m[1], 10); 
    }
  }
  if (e.type === 'WORK-AM') return 6;
  if (e.type === 'WORK-PROJ') return 8;
  if (e.type === 'WORK-SW1') return 10;
  if (e.type === 'WORK-PM') return 14;
  if (e.type === 'WORK-SW2') return 18;
  if (e.type === 'WORK-MID') return 22;
  if (e.type === 'WORK-SW3') return 2;
  
  if (['WOP', 'UNPTO', 'UNPAID-UNSCHED', 'TARDY', 'NO-SHOW'].includes(e.type)) return 0;
  
  return 24; 
};

interface OtDtSplit {
  otH: number;
  dtH: number;
}

const otDtSplitCache = new WeakMap<LogsState, Record<string, Record<number, OtDtSplit>>>();

export const getOtDtSplit = (e: LogEntry, dayLogs?: LogEntry[], settings?: any, logs?: { [key: string]: LogEntry[] }, dateStr?: string): OtDtSplit => {
  const h = parseFloat(e.hrs as any) || 0;
  
  if (logs && dateStr && (e as any)._origIdx !== undefined) {
    let cacheForLogs = otDtSplitCache.get(logs);
    if (!cacheForLogs) {
      cacheForLogs = {};
      otDtSplitCache.set(logs, cacheForLogs);
    }
    if (!cacheForLogs[dateStr]) {
      cacheForLogs[dateStr] = {};
    }
    const cached = cacheForLogs[dateStr][(e as any)._origIdx];
    if (cached) return cached;
  }

  let runningDailyTotal = 0;
  let runningDailyOtTotal = 0;

  if (dayLogs && settings) {
    const totalWorkHrs = dayLogs.reduce((sum, log) => {
      if (log.type && (log.type === 'WORK' || log.type.startsWith('WORK-'))) {
        return sum + (parseFloat(log.hrs as any) || 0);
      }
      return sum;
    }, 0);

    runningDailyTotal = totalWorkHrs;

    const sorted = [...dayLogs].map((e, idx) => ({...e, _tempIdx: (e as any)._origIdx !== undefined ? (e as any)._origIdx : idx})).sort((a, b) => {
      const diff = getBlockStartHour(a) - getBlockStartHour(b);
      if (diff !== 0) return diff;
      return a._tempIdx - b._tempIdx;
    });
    
    // Calculate running totals up to this block chronologically
    for (const log of sorted) {
      // Robust comparison: check reference first, then properties if needed
      const isMatch = (log === e) || (
        log.type === e.type && 
        log.hrs === e.hrs && 
        log.label === e.label && 
        log.otRule === e.otRule &&
        ((e as any)._origIdx !== undefined ? (log as any)._tempIdx === (e as any)._origIdx : true)
      );
      
      if (isMatch) break;
      
      if (log.type === 'OT' || log.type === 'DT') {
        runningDailyTotal += (parseFloat(log.hrs as any) || 0);
        runningDailyOtTotal += (parseFloat(log.hrs as any) || 0);
      }
    }
  }

  let isDt = e.type === 'DT' || e.otRule === 'dt' || e.otRule === 'double';
  if (!isDt && dateStr && logs) {
    if (isConsecutiveDtDay(dateStr, logs)) {
      isDt = true;
    }
  }

  let result: OtDtSplit;
  if (isDt) {
    result = { otH: 0, dtH: h };
  } else {
    const targetDate = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const rule = getActiveRule(targetDate, settings);
            const dtTotalHrs = parseInt(rule.dtThresholdTotalHrs) || 12;
            const dtOtHrs = parseInt(rule.dtThresholdOtHrs) || 8;
            const remainingTo12Total = Math.max(0, dtTotalHrs - runningDailyTotal);
            const remainingTo8Ot = Math.max(0, dtOtHrs - runningDailyOtTotal);
    const splitAt = Math.min(remainingTo12Total, remainingTo8Ot);

    const otH = Math.min(h, splitAt);
    const dtH = Math.max(0, h - splitAt);

    result = { otH, dtH };
  }

  if (logs && dateStr && (e as any)._origIdx !== undefined) {
    const cacheForLogs = otDtSplitCache.get(logs)!;
    cacheForLogs[dateStr][(e as any)._origIdx] = result;
  }

  return result;
};

export const getBlockLabel = (e: LogEntry, dayLogs?: LogEntry[], shortFormat: boolean = false, settings?: any, logs?: { [key: string]: LogEntry[] }, dateStr?: string) => {
  const hrsDisp = e.hrs % 1 === 0 ? e.hrs : parseFloat(e.hrs as any).toFixed(2);
  let typeName = e.type;
  
  if (e.type === 'OT') {
    const { otH, dtH } = getOtDtSplit(e, dayLogs, settings, logs, dateStr);
    if (otH === 0 && dtH > 0) {
      typeName = 'DT';
    } else if (otH > 0 && dtH > 0) {
      typeName = 'OT/DT';
    } else {
      typeName = 'OT';
    }
  }
  
  if (e.type === 'UNPAID-UNSCHED') typeName = 'UNPAID';
  if (e.type === 'PTO2') typeName = 'SEC PTO';
  if (e.type === 'FML-UNP') typeName = 'FMLA-U';
  if (e.type === 'MED-UNP') typeName = 'MED-U';
  if (e.type === 'MED-P') typeName = 'MED-P';
  if (e.type === 'MED-P-PTO') typeName = 'MED-P (PTO)';
  if (e.type === 'PERSONAL-NOTE') typeName = 'NOTE';
  if (['TARDY', 'NO-SHOW'].includes(e.type) && e.unpaidHrs === 0) typeName += " (Pd)";
  if (e.type.startsWith('WORK-')) typeName = e.type.replace('WORK-', ''); 
  
  let labelSuffix = "";
  if (e.label) {
    labelSuffix = ` ${e.label}`;
  } else if (!shortFormat && e.type.startsWith('WORK-')) {
    const times: Record<string, string> = { 'WORK-AM': '0600-1400', 'WORK-PM': '1400-2200', 'WORK-MID': '2200-0600', 'WORK-SW1': '1000-1800', 'WORK-SW2': '1800-0200', 'WORK-SW3': '0200-1000', 'WORK-PROJ': '0800-0400' };
    if (times[e.type]) labelSuffix = ` ${times[e.type]}`;
  }

  if (shortFormat) {
    if (e.type === 'PERSONAL-NOTE') return 'NOTE';
    if (e.type === 'HOL' && !e.label) return 'HOL';
    if (e.type === 'HOL-W' && !e.label) return 'HOL-W';
    if (e.type === 'UNPTO' && !e.label) return 'UNPTO';
    if (e.type === 'PTO2' && !e.label) return 'PTO2';
    if (e.type === 'WOP' && !e.label) return 'WOP';
    return typeName;
  }

  let fullLabel = `${typeName}${labelSuffix} (${hrsDisp}h)`;
  if (e.type === 'HOL' && !e.label) fullLabel = 'HOL';
  if (e.type === 'HOL-W' && !e.label) fullLabel = 'HOL-W';
  if (e.type === 'PERSONAL-NOTE') return 'PERSONAL NOTE';
  if (e.type === 'UNPTO' && !e.label) fullLabel = `UNPTO ${e.hrs}h`;
  if (e.type === 'WOP' && !e.label) fullLabel = `WOP ${hrsDisp}h`;
  
  return fullLabel;
};

export const getBlockClass = (e: LogEntry, dayLogs?: LogEntry[], settings?: any, logs?: { [key: string]: LogEntry[] }, dateStr?: string) => {
  let tCls = e.type;
  if (e.type === 'PERSONAL-NOTE') return 'NOTE';
  if (e.type === 'PTO2') return 'PTO';
  if (['UNPTO', 'UNPAID-UNSCHED', 'TARDY', 'NO-SHOW', 'WOP'].includes(e.type)) return 'INF';
  
  if (e.type === 'OT') {
    const { otH, dtH } = getOtDtSplit(e, dayLogs, settings, logs, dateStr);
    if (otH === 0 && dtH > 0) {
      return 'DT';
    } else if (otH > 0 && dtH > 0) {
      return 'OT-DT';
    }
  }
  
  return tCls;
};

export const getBlockTooltip = (e: LogEntry, fmlaCases: any[], dayLogs?: LogEntry[], settings?: any, logs?: { [key: string]: LogEntry[] }, dateStr?: string) => {
  const hrsDisp = e.hrs % 1 === 0 ? e.hrs : parseFloat(e.hrs as any).toFixed(2);
  let tooltip = `${e.type.replace('WORK-', '')} - ${hrsDisp} Hours`;

  if (e.type === 'PERSONAL-NOTE') {
    return e.note ? `Note: ${e.note}` : 'Personal Note';
  }

  if (e.label) {
    tooltip += `\nShift Label: ${e.label}`;
  }

  if (e.note) {
    tooltip += `\nPersonal Note: ${e.note}`;
  }

  if (e.type === 'FMLA-P' || e.type === 'FML-UNP') {
    const cInfo = fmlaCases.find(c => String(c.num) === String(e.fmlaCase));
    if (cInfo) {
      tooltip += `\nCase #${cInfo.num} | Rel: ${cInfo.rel} | Note: ${cInfo.note || 'None'}`;
    } else {
      tooltip += e.fmlaCase ? `\nCase #${e.fmlaCase}` : "\nFMLA (No Case Selected)";
    }
    return tooltip;
  }
  
  if (e.type === 'OT' || e.type === 'DT') {
    const otMult = '1.5';
    const dtMult = '2.0';
    
    const { otH, dtH } = getOtDtSplit(e, dayLogs, settings, logs, dateStr);

    if (otH === 0) {
      tooltip += `\nDouble Time: ${dtH}h @ ${dtMult}x`;
    } else if (otH > 0 && dtH > 0) {
      tooltip += `\nSplit Pay:\n${otH}h @ ${otMult}x | ${dtH}h @ ${dtMult}x`;
    } else {
      tooltip += `\nStandard OT: ${otH}h @ ${otMult}x`;
    }
    return tooltip;
  }
  
  if (['TARDY', 'NO-SHOW'].includes(e.type)) {
    const h = parseFloat(e.hrs as any) || 0;
    const unp = e.unpaidHrs !== undefined ? parseFloat(e.unpaidHrs as any) : h;
    if (unp > 0) {
      tooltip += `\nUnpaid Hours: ${unp}`;
    } else {
      tooltip += `\n(Paid)`;
    }
  }

  return tooltip;
};

export const getShiftTimes = (entry: LogEntry) => {
  if (!entry.type.startsWith('WORK') && entry.type !== 'OT' && entry.type !== 'DT') return null;

  if (entry.label) {
    const m = entry.label.match(/^(\d{2}):?(\d{2})\s*-\s*(\d{2}):?(\d{2})/);
    if (m) {
      const start = parseInt(m[1], 10) + (parseInt(m[2], 10)/60);
      const end = parseInt(m[3], 10) + (parseInt(m[4], 10)/60);
      return { start, end };
    }
  }
  const times: Record<string, {start: number, end: number}> = { 
    'WORK-AM': {start: 6, end: 14}, 
    'WORK-PM': {start: 14, end: 22}, 
    'WORK-MID': {start: 22, end: 6}, 
    'WORK-SW1': {start: 10, end: 18}, 
    'WORK-SW2': {start: 18, end: 2}, 
    'WORK-SW3': {start: 2, end: 10}, 
    'WORK-PROJ': {start: 20, end: 4} 
  };
  if (times[entry.type]) return times[entry.type];
  return { start: 8, end: 16 }; 
};

export const autoAssignWorkedHolidays = (logs: LogsState) => {
  const newLogs = { ...logs };
  
  // 1. Clear all existing HOL-W entries
  for (const d in newLogs) {
    if (newLogs[d] && Array.isArray(newLogs[d])) {
      newLogs[d] = newLogs[d].filter(e => e.type !== 'HOL-W');
      if (newLogs[d].length === 0) delete newLogs[d];
    }
  }

  const aggregatedHolHrs: Record<string, number> = {};

  // 2. Iterate through all logs to find shifts that qualify for HOL-W
  // Qualifiers: 
  // - Shift starts on a Crew Scheduling Holiday (swaHolidays)
  // - Shift is a MID shift the day before a Crew Scheduling Holiday
  for (const dStr in newLogs) {
    if (!Array.isArray(newLogs[dStr])) continue;

    newLogs[dStr].forEach(e => {
      if (!e.type) return;
      // Only WORK, OT, or DT shifts can qualify for HOL-W
      if (!e.type.startsWith('WORK') && e.type !== 'OT' && e.type !== 'DT') return;

      const h = parseFloat(e.hrs as any) || 0;
      if (h <= 0) return;

      // Rule A: Working ON a crew scheduling holiday
      const isHoliday = !!swaHolidays[dStr];

      // Rule B: Working the MID shift the day BEFORE a crew scheduling holiday
      const date = new Date(dStr + "T00:00:00");
      date.setDate(date.getDate() + 1);
      const nextDateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const isNextDayHoliday = !!swaHolidays[nextDateStr];
      
      // A shift is considered "MID" if it starts between 20:00 and 23:59
      const startHr = getBlockStartHour(e);
      const isMidShift = startHr >= 20 && startHr <= 23;
      const isEveMid = isMidShift && isNextDayHoliday;

      if (isEveMid || isHoliday) {
        aggregatedHolHrs[dStr] = (aggregatedHolHrs[dStr] || 0) + h;
      }
    });
  }

  // 3. Create the HOL-W entries
  for (const dStr in aggregatedHolHrs) {
    if (aggregatedHolHrs[dStr] > 0) {
      if (!newLogs[dStr]) newLogs[dStr] = [];
      newLogs[dStr].push({ 
        type: 'HOL-W', 
        hrs: aggregatedHolHrs[dStr], 
        prem: false, 
        otRule: 'std' 
      });
    }
  }

  return newLogs;
};
