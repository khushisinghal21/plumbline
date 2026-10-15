// Core data model for a weekly certified payroll on a Davis-Bacon covered project.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** One classification on the wage determination: basic hourly rate + fringe per hour. */
export interface WageRate {
  classification: string;
  base: number;
  fringe: number;
}

export interface WageDetermination {
  id: string;
  modification: number;
  publishedDate: string;
  rates: WageRate[];
}

/** A registered apprenticeship program (federal OA or state SAA). */
export interface ApprenticeProgram {
  id: string;
  name: string;
  /** Wage-determination classification this program trains for. */
  classification: string;
  /** Journeyworkers required on site, per apprentice, each day (1 = a 1:1 ratio). */
  journeyworkersPerApprentice: number;
  /** "full": apprentices get the full listed fringe. "percent": same % as their wage level. */
  fringeRule: "full" | "percent";
  registeredWith: string;
}

export interface Project {
  name: string;
  contractNumber: string;
  contractValue: number;
  location: string;
  contractor: string;
  weekEnding: string;
  wd: WageDetermination;
  programs: ApprenticeProgram[];
}

export interface FringePlan {
  plan: string;
  perHour: number;
}

export interface ApprenticeInfo {
  programId?: string;
  registrationNumber?: string;
  /** Progression level as a percent of the journeyworker basic rate, e.g. 50. */
  levelPercent: number;
  /** ISO date the apprentice started on this project (decides who is "over ratio"). */
  startedOnProject: string;
}

export interface WorkerWeek {
  id: string;
  name: string;
  classification: string;
  role: "journeyworker" | "apprentice";
  apprentice?: ApprenticeInfo;
  /** Hours worked on this project, Mon..Sun. */
  hours: number[];
  /** Straight-time cash rate actually paid. */
  basePaid: number;
  /** Cash rate actually paid for hours over 40. */
  otRatePaid: number;
  /** Cash paid in lieu of fringe benefits, per hour. */
  cashInLieuPerHour: number;
  /** Creditable bona fide fringe contributions, per hour. */
  plans: FringePlan[];
  /** Gross pay for this project as reported on the payroll. */
  grossReported: number;
  deductions: number;
  language: "en" | "es";
}

export type Severity = "violation" | "warning" | "info";

export type RuleId =
  | "WAGE_SHORTFALL"
  | "OT_PREMIUM"
  | "APPRENTICE_UNREGISTERED"
  | "APPRENTICE_RATIO"
  | "UNMAPPED_CLASSIFICATION"
  | "GROSS_MISMATCH"
  | "HOURS_DATA"
  | "CWHSSA_NOT_APPLICABLE";

export type CorrectionType = "BACK_PAY" | "CONFORMANCE" | "FIX_RECORD" | "VERIFY_DATA" | "NONE";

export interface Finding {
  id: string;
  rule: RuleId;
  severity: Severity;
  workerId?: string;
  workerName?: string;
  title: string;
  /** Plain-language explanation that shows the arithmetic. */
  detail: string;
  citation: string;
  /** Back pay owed in dollars, or null when it cannot be computed. */
  amountOwed: number | null;
  correction: { type: CorrectionType; description: string };
}

export type ApprenticeStatus = "journeyworker" | "registered-apprentice" | "unregistered-apprentice";

export interface WorkerResult {
  worker: WorkerWeek;
  status: ApprenticeStatus;
  rate: WageRate | null;
  program: ApprenticeProgram | null;
  totalHours: number;
  stHours: number;
  otHours: number;
  dailyST: number[];
  dailyOT: number[];
  /** Days (0=Mon) on which this apprentice was over the allowed ratio. */
  overRatioDays: number[];
  /** Required straight-time base/fringe on a normal (in-ratio) day. */
  requiredBase: number | null;
  requiredFringe: number | null;
  fringePaidPerHour: number;
  computedGross: number;
  owed: number;
  findingIds: string[];
}

export interface RatioEvent {
  day: number;
  classification: string;
  journeyworkers: number;
  apprentices: number;
  allowed: number;
  overWorkerIds: string[];
}

export interface CheckResult {
  workers: WorkerResult[];
  findings: Finding[];
  ratioEvents: RatioEvent[];
  cwhssaApplies: boolean;
  totals: {
    workers: number;
    hours: number;
    violations: number;
    warnings: number;
    owed: number;
  };
}
