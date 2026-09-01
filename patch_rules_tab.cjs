const fs = require('fs');
let code = fs.readFileSync('src/components/Modals.tsx', 'utf8');

const rulesTabHTML = `
              {/* Tab 6: Rules */}
              {activeGuideTab === 'rules' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                  <div className="bg-[var(--swa-blue)]/5 p-5 rounded-2xl border border-[var(--swa-blue)]/20">
                    <p className="text-sm leading-relaxed text-[var(--text-main)] font-semibold m-0">
                      View and edit operational rules affecting your schedule and pay calculations.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-2">
                      <h4 className="text-sm font-black uppercase text-[var(--swa-blue)] tracking-wider m-0">Current Operational Rules</h4>
                      <button 
                        onClick={() => {
                          const id = Date.now().toString();
                          const today = new Date().toISOString().split('T')[0];
                          const newRule = { id, effectiveDate: today, rollingPeriodMonths: '12', dtThresholdTotalHrs: '12', dtThresholdOtHrs: '8' };
                          props.updateSettings({ rules: [...(props.settings.rules || []), newRule] });
                        }}
                        className="bg-[var(--swa-blue)] text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors"
                      >
                        + Add Rule Version
                      </button>
                    </div>

                    {(props.settings.rules || []).length === 0 && (
                      <div className="text-sm text-[var(--text-muted)] italic py-2">
                        Using default rules (12-month rolling period, DT after 12 total / 8 OT hours). Click Add to customize.
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
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)]"
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
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)]"
                            />
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
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)]"
                            />
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
                              className="w-full p-2 bg-[var(--sub-bg)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-main)]"
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            if(window.confirm('Are you sure you want to delete this rule version?')) {
                              const newRules = (props.settings.rules || []).filter(r => r.id !== rule.id);
                              props.updateSettings({ rules: newRules });
                            }
                          }}
                          className="mt-2 text-[var(--swa-red)] hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors"
                        >
                          <Trash2 size={12} /> Delete Version
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
`;

code = code.replace(
  "{/* Tab 5: Pay & FMLA */}",
  rulesTabHTML + "\n              {/* Tab 5: Pay & FMLA */}"
);

fs.writeFileSync('src/components/Modals.tsx', code);
