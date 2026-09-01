const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

// For Lost Wages:
code = code.replace(/-\\\$\\\{/g, "-${");

// For Mid Diffs:
code = code.replace(/@ \\\$\\\{/g, "@ ${");
code = code.replace(/>\\\$\\\{/g, ">${");

// Remove the escaped braces that might have been left over
code = code.replace(/\\\}/g, "}");

fs.writeFileSync('src/components/Modals.tsx', code);
