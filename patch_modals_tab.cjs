const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

code = code.replace(
  "{ id: 'payFmla', label: '💰 Pay & FMLA', desc: 'Premium Audits' }",
  "{ id: 'payFmla', label: '💰 Pay & FMLA', desc: 'Premium Audits' },\n                { id: 'rules', label: '⚙️ Op Rules', desc: 'Custom Rules' }"
);

fs.writeFileSync('src/components/Modals.tsx', code);
