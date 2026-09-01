const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /let midCount = 0;\n\s*let midAmt = 0;/g,
  `let midCount = 0;\n  let midAmt = 0;\n  let midDates: string[] = [];`
);

code = code.replace(
  /midCount = stats\.count;\n\s*midAmt = stats\.amt;/g,
  `midCount = stats.count;\n      midAmt = stats.amt;\n      midDates = stats.dates;`
);

code = code.replace(
  /midCount, midAmt/g,
  `midCount, midAmt, midDates`
);

fs.writeFileSync('src/utils/calculations.ts', code);
