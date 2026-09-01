const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /const remainingTo12Total = Math.max\(0, 12 - runningDailyTotal\);\s*const remainingTo8Ot = Math.max\(0, 8 - runningDailyOtTotal\);/g,
  `const rule = getActiveRule(new Date(y, m, day), settings);
            const dtTotalHrs = parseInt(rule.dtThresholdTotalHrs) || 12;
            const dtOtHrs = parseInt(rule.dtThresholdOtHrs) || 8;
            const remainingTo12Total = Math.max(0, dtTotalHrs - runningDailyTotal);
            const remainingTo8Ot = Math.max(0, dtOtHrs - runningDailyOtTotal);`
);

fs.writeFileSync('src/utils/calculations.ts', code);
