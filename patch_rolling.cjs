const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  `const startTarget = asOfDate 
    ? new Date(asOfDate.getFullYear() - 1, asOfDate.getMonth(), asOfDate.getDate() + 1)
    : new Date(y - 1, m + 1, 1);`,
  `const rule = getActiveRule(endTarget, settings);
  const monthsStr = rule.rollingPeriodMonths || '12';
  const rollingMonths = parseInt(monthsStr) || 12;
  const startTarget = asOfDate 
    ? new Date(asOfDate.getFullYear(), asOfDate.getMonth() - rollingMonths, asOfDate.getDate() + 1)
    : new Date(y, m - rollingMonths + 1, 1);`
);

fs.writeFileSync('src/utils/calculations.ts', code);
