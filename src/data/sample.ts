import { Project, WorkerWeek } from "../engine/types";

// Sample data only. Names, rates, contract numbers and the wage determination are
// invented for the demo and do not come from SAM.gov or any real payroll.

export const sampleProject: Project = {
  name: "Riverbend Community Health Center",
  contractNumber: "C-2026-0417 (sample)",
  contractValue: 4_850_000,
  location: "Sacramento County, CA",
  contractor: "Northgate Electric & Builders (sample)",
  weekEnding: "2026-10-11",
  wd: {
    id: "SAMPLE-CA20260012",
    modification: 2,
    publishedDate: "2026-08-14",
    rates: [
      { classification: "Electrician", base: 52.15, fringe: 33.4 },
      { classification: "Laborer (Group 1)", base: 31.8, fringe: 24.1 },
      { classification: "Carpenter", base: 45.6, fringe: 29.85 },
      { classification: "Plumber", base: 54.2, fringe: 35.1 },
      { classification: "Operating Engineer (Group 2)", base: 48.75, fringe: 31.2 },
      { classification: "Cement Mason", base: 41.3, fringe: 26.55 },
    ],
  },
  programs: [
    {
      id: "EL-JATC",
      name: "Valley Electrical JATC",
      classification: "Electrician",
      journeyworkersPerApprentice: 1,
      fringeRule: "full",
      registeredWith: "State Apprenticeship Agency (sample)",
    },
  ],
};

const elecPlans = [
  { plan: "Health & Welfare", perHour: 14.2 },
  { plan: "Pension", perHour: 16.7 },
  { plan: "Training & Vacation", perHour: 2.5 },
];
const laborPlans = [
  { plan: "Health & Welfare", perHour: 9.85 },
  { plan: "Pension", perHour: 11.4 },
  { plan: "Training", perHour: 2.85 },
];

export const sampleWorkers: WorkerWeek[] = [
  {
    id: "W01", name: "Maria Lopez", classification: "Electrician", role: "journeyworker",
    hours: [8, 8, 0, 8, 8, 0, 0], basePaid: 52.15, otRatePaid: 78.23, cashInLieuPerHour: 0,
    plans: elecPlans, grossReported: 1668.8, deductions: 512.4, language: "en",
  },
  {
    id: "W02", name: "James Carter", classification: "Electrician", role: "journeyworker",
    hours: [9, 9, 9, 9, 8, 0, 0], basePaid: 52.15, otRatePaid: 78.23, cashInLieuPerHour: 0,
    plans: elecPlans, grossReported: 2398.92, deductions: 735.1, language: "en",
  },
  {
    id: "W03", name: "Diego Ramirez", classification: "Electrician", role: "apprentice",
    apprentice: { programId: "EL-JATC", registrationNumber: "SAA-2025-118842", levelPercent: 50, startedOnProject: "2025-03-01" },
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 26.08, otRatePaid: 39.12, cashInLieuPerHour: 0,
    plans: elecPlans, grossReported: 1043.2, deductions: 260.8, language: "es",
  },
  {
    id: "W04", name: "Luis Hernández", classification: "Electrician", role: "apprentice",
    apprentice: { programId: "EL-JATC", registrationNumber: "SAA-2026-204117", levelPercent: 40, startedOnProject: "2026-09-20" },
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 20.86, otRatePaid: 31.29, cashInLieuPerHour: 0,
    plans: elecPlans, grossReported: 834.4, deductions: 166.88, language: "es",
  },
  {
    id: "W05", name: "Kevin O'Brien", classification: "Electrician", role: "apprentice",
    apprentice: { programId: "EL-JATC", registrationNumber: "", levelPercent: 60, startedOnProject: "2026-06-01" },
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 31.29, otRatePaid: 46.94, cashInLieuPerHour: 0,
    plans: elecPlans, grossReported: 1251.6, deductions: 312.9, language: "en",
  },
  {
    id: "W06", name: "Tyrone Jackson", classification: "Laborer (Group 1)", role: "journeyworker",
    hours: [9, 9, 9, 9, 9, 1, 0], basePaid: 31.8, otRatePaid: 31.8, cashInLieuPerHour: 0,
    plans: laborPlans, grossReported: 1462.8, deductions: 351.07, language: "en",
  },
  {
    id: "W07", name: "Ana Sofía Torres", classification: "Laborer (Group 1)", role: "journeyworker",
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 29.5, otRatePaid: 44.25, cashInLieuPerHour: 0,
    plans: laborPlans, grossReported: 1180, deductions: 236, language: "es",
  },
  {
    id: "W08", name: "Ben Whitaker", classification: "Carpenter", role: "journeyworker",
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 48, otRatePaid: 72, cashInLieuPerHour: 2,
    plans: [{ plan: "Health & Welfare", perHour: 12 }, { plan: "Pension", perHour: 13 }],
    grossReported: 2000, deductions: 520, language: "en",
  },
  {
    id: "W09", name: "Wei Chen", classification: "Drywall Finisher", role: "journeyworker",
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 38, otRatePaid: 57, cashInLieuPerHour: 0,
    plans: [{ plan: "Health & Welfare", perHour: 20 }], grossReported: 1520, deductions: 380, language: "en",
  },
  {
    id: "W10", name: "Samuel Okafor", classification: "Operating Engineer (Group 2)", role: "journeyworker",
    hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 48.75, otRatePaid: 73.13, cashInLieuPerHour: 0,
    plans: [{ plan: "Health & Welfare", perHour: 13.6 }, { plan: "Pension", perHour: 15.1 }, { plan: "Training", perHour: 2.5 }],
    grossReported: 1905, deductions: 467.5, language: "en",
  },
  {
    id: "W11", name: "Daniel Kim", classification: "Plumber", role: "journeyworker",
    hours: [18, 8, 8, 7, 0, 0, 0], basePaid: 54.2, otRatePaid: 81.3, cashInLieuPerHour: 0,
    plans: [{ plan: "Health & Welfare", perHour: 15.4 }, { plan: "Pension", perHour: 17.2 }, { plan: "Training", perHour: 2.5 }],
    grossReported: 2249.3, deductions: 674.79, language: "en",
  },
];
