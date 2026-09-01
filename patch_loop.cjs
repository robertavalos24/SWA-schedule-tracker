const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

code = code.replace(
  /let current = new Date\(start\);\n\s*while \(current <= end\) {/g,
  `let current = new Date(start);\n  current.setHours(0,0,0,0);\n  const endD = new Date(end);\n  endD.setHours(23,59,59,999);\n  while (current <= endD) {`
);

fs.writeFileSync('src/utils/calculations.ts', code);
