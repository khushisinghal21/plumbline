import { describe, expect, it } from "vitest";
import { runChecks, splitOvertime } from "./check";
import { sampleProject, sampleWorkers } from "../data/sample";
import { Project, WorkerWeek } from "./types";

const jw = (over: Partial<WorkerWeek> = {}): WorkerWeek => ({
  id: "X1", name: "Test Worker", classification: "Laborer (Group 1)", role: "journeyworker",
  hours: [8, 8, 8, 8, 8, 0, 0], basePaid: 31.8, otRatePaid: 47.7, cashInLieuPerHour: 0,
  plans: [{ plan: "All plans", perHour: 24.1 }], grossReported: 1272, deductions: 0, language: "en", ...over,
});

const byRule = (r: ReturnType<typeof runChecks>, rule: string) => r.findings.filter((f) => f.rule === rule);

describe("splitOvertime", () => {
  it("assigns hours past 40 in day order", () => {
    expect(splitOvertime([9, 9, 9, 9, 9, 1, 0])).toEqual({ st: [9, 9, 9, 9, 4, 0, 0], ot: [0, 0, 0, 0, 5, 1, 0] });
  });
  it("has no overtime at exactly 40", () => {
    expect(splitOvertime([8, 8, 8, 8, 8, 0, 0]).ot.every((h) => h === 0)).toBe(true);
  });
});

describe("prevailing wage", () => {
  it("passes a correctly paid journeyworker", () => {
    const r = runChecks(sampleProject, [jw()]);
    expect(r.findings.filter((f) => f.severity === "violation")).toHaveLength(0);
    expect(r.totals.owed).toBe(0);
  });

  it("computes a base-rate shortfall per hour × hours", () => {
    const r = runChecks(sampleProject, [jw({ basePaid: 29.5, grossReported: 1180 })]);
    const f = byRule(r, "WAGE_SHORTFALL")[0];
    expect(f.amountOwed).toBe(92); // (55.90 - 53.60) × 40
  });

  it("lets cash above the base rate offset a fringe gap (DBRA combination rule)", () => {
    const r = runChecks(sampleProject, [jw({ basePaid: 35.0, plans: [{ plan: "All", perHour: 20.9 }], grossReported: 1400 })]);
    expect(byRule(r, "WAGE_SHORTFALL")).toHaveLength(0); // 35.00 + 20.90 = 55.90
  });

  it("counts cash in lieu of fringe toward the package", () => {
    const p: Project = sampleProject;
    const carpenter = jw({ classification: "Carpenter", basePaid: 48, cashInLieuPerHour: 2, plans: [{ plan: "All", perHour: 25 }], grossReported: 2000 });
    const r = runChecks(p, [carpenter]);
    expect(byRule(r, "WAGE_SHORTFALL")[0].amountOwed).toBe(18); // (75.45 - 75.00) × 40
  });
});

describe("overtime (CWHSSA)", () => {
  it("flags overtime paid at straight time", () => {
    const r = runChecks(sampleProject, [jw({ hours: [9, 9, 9, 9, 9, 1, 0], otRatePaid: 31.8, grossReported: 1462.8 })]);
    expect(byRule(r, "OT_PREMIUM")[0].amountOwed).toBe(95.4); // 0.5 × 31.80 × 6
  });

  it("uses the higher actual base as the basic rate", () => {
    const r = runChecks(sampleProject, [jw({ hours: [10, 10, 10, 10, 10, 0, 0], basePaid: 40, otRatePaid: 47.7, plans: [{ plan: "All", perHour: 24.1 }], grossReported: 1600 + 477 })]);
    // required premium 0.5 × 40 = 20; paid 7.70 → short 12.30 × 10
    expect(byRule(r, "OT_PREMIUM")[0].amountOwed).toBe(123);
  });

  it("skips CWHSSA on contracts at or below $100,000", () => {
    const small = { ...sampleProject, contractValue: 100_000 };
    const r = runChecks(small, [jw({ hours: [9, 9, 9, 9, 9, 1, 0], otRatePaid: 31.8, grossReported: 1462.8 })]);
    expect(byRule(r, "OT_PREMIUM")).toHaveLength(0);
    expect(byRule(r, "CWHSSA_NOT_APPLICABLE")).toHaveLength(1);
  });
});

describe("apprentices", () => {
  const journey = (id: string, hours: number[]): WorkerWeek => ({
    ...jw(), id, name: id, classification: "Electrician", basePaid: 52.15, otRatePaid: 78.23,
    plans: [{ plan: "All", perHour: 33.4 }], hours, grossReported: hours.reduce((a, b) => a + b, 0) * 52.15,
  });
  const appr = (id: string, start: string, level: number, reg = "SAA-1"): WorkerWeek => ({
    ...journey(id, [8, 8, 8, 8, 8, 0, 0]), role: "apprentice", basePaid: 52.15 * level / 100,
    apprentice: { programId: "EL-JATC", registrationNumber: reg, levelPercent: level, startedOnProject: start },
    grossReported: 40 * 52.15 * level / 100,
  });

  it("accepts a registered apprentice within ratio at the program rate", () => {
    const r = runChecks(sampleProject, [journey("J1", [8, 8, 8, 8, 8, 0, 0]), appr("A1", "2026-01-01", 50)]);
    expect(r.findings.filter((f) => f.severity === "violation")).toHaveLength(0);
  });

  it("owes the full rate to an unregistered apprentice", () => {
    const r = runChecks(sampleProject, [journey("J1", [8, 8, 8, 8, 8, 0, 0]), appr("A1", "2026-01-01", 60, "")]);
    const f = byRule(r, "APPRENTICE_UNREGISTERED")[0];
    expect(f.amountOwed).toBe(834.4); // (52.15 − 31.29) × 40
  });

  it("measures the ratio daily and charges the last apprentice to start", () => {
    const r = runChecks(sampleProject, [
      journey("J1", [8, 8, 0, 8, 8, 0, 0]),
      journey("J2", [8, 8, 8, 8, 8, 0, 0]),
      appr("Early", "2025-03-01", 50),
      appr("Late", "2026-09-20", 40),
    ]);
    const ratio = byRule(r, "APPRENTICE_RATIO");
    expect(ratio).toHaveLength(1);
    expect(ratio[0].workerId).toBe("Late");
    expect(ratio[0].amountOwed).toBe(250.32); // (85.55 − 54.26) × 8 on Wednesday
    expect(r.ratioEvents.find((e) => e.day === 2)?.allowed).toBe(1);
  });
});

describe("records and data", () => {
  it("flags a classification missing from the wage determination", () => {
    const r = runChecks(sampleProject, [jw({ classification: "Drywall Finisher" })]);
    expect(byRule(r, "UNMAPPED_CLASSIFICATION")).toHaveLength(1);
  });

  it("flags gross pay that does not match hours × rates", () => {
    const r = runChecks(sampleProject, [jw({ grossReported: 1227 })]);
    expect(byRule(r, "GROSS_MISMATCH")).toHaveLength(1);
  });

  it("flags implausible daily hours", () => {
    const r = runChecks(sampleProject, [jw({ hours: [18, 8, 8, 6, 0, 0, 0], grossReported: 1272 })]);
    expect(byRule(r, "HOURS_DATA")).toHaveLength(1);
  });
});

describe("sample payroll", () => {
  it("matches the hand-computed totals", () => {
    const r = runChecks(sampleProject, sampleWorkers);
    expect(r.totals.violations).toBe(6);
    expect(r.totals.warnings).toBe(2);
    expect(r.totals.owed).toBe(1290.12); // 250.32 + 834.40 + 95.40 + 92.00 + 18.00
  });
});
