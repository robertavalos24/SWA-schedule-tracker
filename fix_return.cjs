const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /midAmt,\n\s*totalLoss,/,
  "midAmt,\n    midDates,\n    totalLoss,"
);

fs.writeFileSync('src/utils/calculations.ts', code);
