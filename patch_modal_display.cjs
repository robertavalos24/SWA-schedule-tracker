const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const newLostWages = `{pay.totalLoss > 0 && (
                      <div className="flex flex-col border-b border-[var(--border-color)] py-1 text-[var(--swa-red)]">
                        <div className="flex justify-between">
                          <span>Lost Wages ({pay.totalUnpaidHrs.toFixed(1)}h):</span>
                          <span>-\\$\\{pay.totalLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})\\}</span>
                        </div>
                        <div className="flex flex-col pl-3 text-[10px] opacity-80 font-normal">
                          {pay.wopLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• WOP/UNPTO/Unsched ({(pay.wopLoss / hrVal).toFixed(1)}h):</span>
                              <span>-\\$\\{pay.wopLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})\\}</span>
                            </div>
                          )}
                          {pay.fmlaUnpLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• FMLA Unpaid ({(pay.fmlaUnpLoss / hrVal).toFixed(1)}h):</span>
                              <span>-\\$\\{pay.fmlaUnpLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})\\}</span>
                            </div>
                          )}
                          {pay.infractionLoss > 0 && (
                            <div className="flex justify-between">
                              <span>• Infractions ({(pay.infractionLoss / hrVal).toFixed(1)}h):</span>
                              <span>-\\$\\{pay.infractionLoss.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})\\}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}`;


const regexLostWages = /\{pay\.totalLoss > 0 && \([\s\S]*?\{\s*pay\.infractionLoss > 0 && \([\s\S]*?\}\)[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\}\)/;

code = code.replace(regexLostWages, newLostWages.replace(/\\\\\\$/g, "$").replace(/\\\\\\{/g, "{").replace(/\\\\\\}/g, "}"));

const oldMidDiffs = /\{pay\.midAmt > 0 && \([\s\S]*?\}\)\}[\s\S]*?<\/div>[\s\S]*?\}\)/;

const newMidDiffs = `{pay.midAmt > 0 && (
                                  <div className="flex flex-col border-b border-black/5 py-1">
                                    <div className="flex justify-between cursor-pointer group" onClick={() => setShowMidDates(!showMidDates)}>
                                      <span className="group-hover:text-[var(--swa-blue)] transition-colors">Midnight Diffs ({pay.midCount} @ \\$\\{ (pay.midAmt / pay.midCount).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) \\}) ▾:</span>
                                      <span className="text-[var(--ra-gold)]">\\$\\{pay.midAmt.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})\\}</span>
                                    </div>
                                    {showMidDates && (pay as any).midDates && (pay as any).midDates.length > 0 && (
                                      <div className="text-[10px] text-[var(--text-muted)] mt-1 ml-2 font-normal capitalize" style={{lineHeight: 1.2}}>
                                        {(pay as any).midDates.map((dStr: string) => {
                                          const match = dStr.match(/^(\\d{4})-(\\d{2})-(\\d{2})\\s*(.*)$/);
                                          if (match) {
                                            const d = parseInt(match[3], 10);
                                            const m = parseInt(match[2], 10) - 1;
                                            const y = parseInt(match[1], 10) % 100;
                                            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                            return \`\${d}, \${monthNames[m]}, \${y} \${match[4]}\`;
                                          }
                                          return dStr;
                                        }).join(' | ')}
                                      </div>
                                    )}
                                  </div>
                                )}`;

code = code.replace(oldMidDiffs, newMidDiffs.replace(/\\\\\\$/g, "$").replace(/\\\\\\{/g, "{").replace(/\\\\\\}/g, "}"));

fs.writeFileSync('src/components/Modals.tsx', code);
