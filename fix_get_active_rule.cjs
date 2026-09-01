const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

const getActiveRuleCode = `
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
`;

code = code.replace(
  "import { LogEntry, Settings, LogsState, MidCountsState } from '../types';",
  "import { LogEntry, Settings, LogsState, MidCountsState, RuleDef } from '../types';\n" + getActiveRuleCode
);

fs.writeFileSync('src/utils/calculations.ts', code);
