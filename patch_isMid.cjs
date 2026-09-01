const fs = require('fs');
let code = fs.readFileSync('src/utils/calculations.ts', 'utf8');

const regex = /e\.label\.startsWith\('22'\) \|\| e\.label\.startsWith\('23'\) \|\| e\.label\.startsWith\('00'\) \|\| e\.label\.startsWith\('01'\) \|\| e\.label\.startsWith\('02'\)/g;
const replacement = "e.label.startsWith('20') || e.label.startsWith('21') || e.label.startsWith('22') || e.label.startsWith('23') || e.label.startsWith('00') || e.label.startsWith('01') || e.label.startsWith('02')";

code = code.replace(regex, replacement);

fs.writeFileSync('src/utils/calculations.ts', code);
