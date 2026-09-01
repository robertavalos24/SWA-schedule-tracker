const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const regex = /\{pay\.midAmt > 0 && \([\s\S]*?\{pay\.stiAmt > 0 && \(/;

const replaceStr = `{pay.midAmt > 0 && (
                                  <div className="flex flex-col border-b border-black/5 py-1">
                                    <div className="flex justify-between">
                                      <span>Midnight Diffs ({pay.midCount} @ $\{ (pay.midAmt / pay.midCount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) }):</span>
                                      <span className="text-[var(--ra-gold)]">$\{pay.midAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                                    </div>
                                    {(pay as any).midDates && (pay as any).midDates.length > 0 && (
                                      <div className="text-[10px] text-[var(--text-muted)] mt-1 ml-2 font-normal lowercase" style={{lineHeight: 1.2}}>
                                        {(pay as any).midDates.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {pay.stiAmt > 0 && (`

code = code.replace(regex, replaceStr);
fs.writeFileSync('src/components/Modals.tsx', code);
