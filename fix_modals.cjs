const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const target = `  2822	                                  </div>
  2823	                                )}}</span>
  2824	                                  </div>
  2825	                                )}
  2826	                              </div>
  2827	                            )}
  2828	                          </div>`;

// Using regex to fix the lines from 2822 to 2828:
const badBlock = /<\/div>\s*\)\}\}<\/span>\s*<\/div>\s*\)\}\s*<\/div>\s*\)\}\s*<\/div>/;

// Wait, let's just use string replace for the specific lines.
code = code.replace(/<\/div>\s*\)\}\}<\/span>\s*<\/div>\s*\)\}/, 
`</div>
                                )}

                                {pay.stiAmt > 0 && (
                                  <div className="flex justify-between py-1">
                                    <span>STI Bonus:</span>
                                    <span className="text-[var(--pay-green)]">\${pay.stiAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                  </div>
                                )}`);

fs.writeFileSync('src/components/Modals.tsx', code);
