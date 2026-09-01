const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

if (!code.includes('export interface RuleDef')) {
  code = code.replace(
    'export interface Settings {',
    `export interface RuleDef {
  id: string;
  effectiveDate: string;
  rollingPeriodMonths: string;
  dtThresholdTotalHrs: string;
  dtThresholdOtHrs: string;
}

export interface Settings {
  rules?: RuleDef[];`
  );
  fs.writeFileSync('src/types.ts', code);
}
