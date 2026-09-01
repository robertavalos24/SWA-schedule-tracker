const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const replacementStr = `                    )}

                    <div className="flex justify-between text-base pt-2 border-t-2 border-[var(--swa-blue)] mt-2">
                      <span><strong>EST. NET PAY:</strong></span>
                      <span className="text-[var(--swa-blue)]"><strong>\${pay.net.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
                    </div>`;

code = code.replace(/                    \)\}\}<\/strong><\/span>\s*<\/div>/, replacementStr);
fs.writeFileSync('src/components/Modals.tsx', code);
