const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
/    if \(override !== undefined && override !== 'auto'\) \{[\s\S]*?\} else \{[\s\S]*?\}/g,
(match) => {
  return `    const stats = getAutoMidStatsForPeriod(start, end, logs, settings);
    midDates = stats.dates;
    if (override !== undefined && override !== 'auto') {
      midCount = parseInt(override as string) / 2;
      midAmt = midCount > 0 ? (midCount * getMidRate(currentLevel)) : 0;
    } else {
      midCount = stats.count;
      midAmt = stats.amt;
    }`;
});

fs.writeFileSync('src/utils/calculations.ts', code);
