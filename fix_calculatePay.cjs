const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  `// Trigger DT after 12 total hours for the day OR 8 total OT hours for the day
            const targetD = dateStr ? new Date(dateStr) : new Date();
    const rule = getActiveRule(targetD, settings);`,
  `// Trigger DT after 12 total hours for the day OR 8 total OT hours for the day
            const rule = getActiveRule(new Date(y, m, day), settings);`
);

fs.writeFileSync('src/utils/calculations.ts', code);
