export type ThemeType = 'light' | 'dark' | 'ocean' | 'sunset' | 'forest';

export interface LogEntry {
  type: string;
  hrs: number;
  prem?: boolean;
  otRule?: string;
  label?: string;
  fmlaCase?: string;
  unpaidHrs?: number;
  coverWithPto?: boolean;
  conjunction?: boolean;
  note?: string;
  _origIdx?: number;
}

export interface FmlaCase {
  num: string;
  rel: string;
  note: string;
  freq: string;
  freqEpi: number;
  freqDays: number;
  bal: number;
  startD: string;
  isContinuous?: boolean;
  isMedicalLeave?: boolean;
  leaveType?: 'Intermittent' | 'Continuous' | 'Medical Leave';
  continuousWeeks?: number;
}

export interface CardPrefs {
  timeoff: boolean;
  att: boolean;
  mid: boolean;
  pay: boolean;
  cardOrder?: string[];
}

export interface PayHistoryEvent {
  id: string;
  date: string;
  type: string;
  oldSalary: string;
  newSalary: string;
  level?: string;
  note: string;
}

export interface RuleDef {
  id: string;
  effectiveDate: string; // YYYY-MM-DD
  rollingPeriodMonths: string;
  dtThresholdTotalHrs: string;
  dtThresholdOtHrs: string;
}

export interface Settings {
  rules?: RuleDef[];
  hireDate: string;
  asOfDate: string;
  startPto: string;
  correctionDate: string;
  correctionStartPto: string;
  accrualChangeDate: string;
  customAccrualRate: string;
  customAccrualCap: string;
  salary: string;
  pctIncrease: string;
  attOverride: string;
  empLevel: string;
  stiBonusPct: string;
  stiCompanyPct: string;
  stiPersonalPct: string;
  stiBonus: string;
  promoDate: string;
  promoSalary: string;
  promoLevel: string;
  adjDate: string;
  adjValue: string;
  perfLetters: string;
  k401Pct: string;
  insuranceDed: string;
  monthlyDeductions: string;
  baseYear: string;
  initialSalary?: string;
  initialYear?: string;
  enableTaxes: string;
  taxFilingStatus: string;
  taxDependents: string;
  fedTaxExempt: string;
  payHistory?: PayHistoryEvent[];
}

export type LogsState = Record<string, LogEntry[]>;
export type MidCountsState = Record<string, string | number>;
