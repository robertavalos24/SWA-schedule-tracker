const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const oldCodeStart = "{/* Tab 6: Rules */}";
const oldCodeEnd = "{/* Tab 5: Pay & FMLA */}";

const rulesTabHTML = `
              {/* Tab 6: Rules */}
              {activeGuideTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      Configure company-specific attendance and pay rules below. These rules are versioned by effective date so past calculations stay intact.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2">
                      <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider m-0">Rule Versions</h4>
                      <button 
                        onClick={() => {
                          const id = Date.now().toString();
                          const today = new Date().toISOString().split('T')[0];
                          const newRule = { id, effectiveDate: today, rollingPeriodMonths: '12', dtThresholdTotalHrs: '12', dtThresholdOtHrs: '8' };
                          props.updateSettings({ rules: [...(props.settings.rules || []), newRule] });
                        }}
                        className="bg-[var(--swa-blue)] text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors shadow-md"
                      >
                        + Add Rule Version
                      </button>
                    </div>

                    {(props.settings.rules || []).length === 0 && (
                      <div className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm space-y-3 relative">
                         <div className="absolute -top-2.5 -right-2.5 bg-gray-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                            Default (System)
                          </div>
                          <p className="text-xs text-[var(--text-muted)] italic m-0">Currently using standard defaults. Add a version to change these parameters.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">Rolling Attendance Period</p>
                               <p className="text-xs font-semibold m-0">12 Months</p>
                            </div>
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">DT After Total Hrs</p>
                               <p className="text-xs font-semibold m-0">12 Hours</p>
                            </div>
                            <div className="bg-[var(--sub-bg)] p-2 rounded-lg border border-[var(--border-color)]">
                               <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">DT After OT Hrs</p>
                               <p className="text-xs font-semibold m-0">8 Hours</p>
                            </div>
                          </div>
                      </div>
                    )}

                    {(props.settings.rules || []).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((rule, idx) => (
                      <div key={rule.id} className="bg-[var(--card-bg)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm space-y-3 relative group">
                        {idx === 0 && (
                          <div className="absolute -top-2.5 -right-2.5 bg-green-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                            Latest
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Effective Date</label>
                            <input 
                              type="date"
                              value={rule.effectiveDate}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], effectiveDate: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Rolling Period (Months)</label>
                            <input 
                              type="number"
                              value={rule.rollingPeriodMonths}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], rollingPeriodMonths: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Controls when absence points drop off.</p>
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DT After Total Hrs</label>
                            <input 
                              type="number"
                              value={rule.dtThresholdTotalHrs}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], dtThresholdTotalHrs: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Hours worked in a day before double-time (DT) kicks in.</p>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DT After OT Hrs</label>
                            <input 
                              type="number"
                              value={rule.dtThresholdOtHrs}
                              onChange={(e) => {
                                const newRules = [...(props.settings.rules || [])];
                                const rIndex = newRules.findIndex(r => r.id === rule.id);
                                if (rIndex >= 0) {
                                  newRules[rIndex] = { ...newRules[rIndex], dtThresholdOtHrs: e.target.value };
                                  props.updateSettings({ rules: newRules });
                                }
                              }}
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)] font-semibold"
                            />
                            <p className="text-[9px] text-[var(--text-muted)] mt-1 mb-0 leading-tight">Overtime hours worked before upgrading to DT.</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            const newRules = (props.settings.rules || []).filter(r => r.id !== rule.id);
                            props.updateSettings({ rules: newRules });
                          }}
                          className="mt-2 text-[var(--swa-red)] hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors bg-transparent border-none cursor-pointer"
                        >
                          <Trash2 size={12} /> Delete Version
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
`;

const startIndex = code.indexOf(oldCodeStart);
const endIndex = code.indexOf(oldCodeEnd);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + rulesTabHTML + "\n              " + code.substring(endIndex);
  fs.writeFileSync('src/components/Modals.tsx', code);
}
