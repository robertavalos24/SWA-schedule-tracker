const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /\['WOP', 'UNPAID-UNSCHED', 'UNPTO'\]/g,
  `['WOP', 'UNPAID-UNSCHED', 'UNPTO', 'TARDY', 'NO-SHOW']`
);

fs.writeFileSync('src/utils/calculations.ts', code);
