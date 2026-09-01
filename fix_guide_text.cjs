const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

code = code.replace(
  "Attendance points are monitored utilizing an exact 12-month (365 days) rolling period.",
  "Attendance points are monitored utilizing your configured rolling period (default 12-month). You can customize this period under the Op Rules tab."
);

code = code.replace(
  "Upon logging FMLA hours, the applet continuously tracks your rolling 12-month usage.",
  "Upon logging FMLA hours, the applet continuously tracks your configured rolling usage."
);

fs.writeFileSync('src/components/Modals.tsx', code);
