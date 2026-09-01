const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  `const rule = getActiveRule(new Date(y, m, day), settings);`,
  `const targetD = dateStr ? new Date(dateStr) : new Date();
    const rule = getActiveRule(targetD, settings);`
);

fs.writeFileSync('src/utils/calculations.ts', code);
