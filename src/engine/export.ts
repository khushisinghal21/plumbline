import { money } from "./check";
import { toCsv } from "./csv";
import { CheckResult, DAYS, Finding, Project } from "./types";

export type Decision = { status: "approved" | "rejected"; note: string; by: string; at: string };

/** Restitution approved by a reviewer, per worker. */
export function approvedRestitution(findings: Finding[], decisions: Record<string, Decision>): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) {
    if (f.workerId && f.amountOwed && decisions[f.id]?.status === "approved") {
      m.set(f.workerId, money((m.get(f.workerId) ?? 0) + f.amountOwed));
    }
  }
  return m;
}

/**
 * A WH-347-style weekly payroll draft (columns follow the revised 2025 form's data:
 * journeyworker/apprentice flag, ST/OT hours by day, fringe credit vs. cash in lieu,
 * gross and net). It is a working draft for review, not the official DOL form.
 */
export function wh347DraftCsv(project: Project, result: CheckResult, decisions: Record<string, Decision>): string {
  const rest = approvedRestitution(result.findings, decisions);
  const header = [
    "Worker ID", "Name", "JW / RA", "Apprentice program", "Classification",
    ...DAYS.flatMap((d) => [`${d} ST`, `${d} OT`]),
    "Total ST hrs", "Total OT hrs", "Rate ST", "Rate OT", "Fringe credit /hr", "Cash in lieu /hr",
    "Gross this project", "Approved restitution", "Gross incl. restitution", "Deductions", "Net pay",
  ];
  const rows = result.workers.map((r) => {
    const w = r.worker;
    const extra = rest.get(w.id) ?? 0;
    const gross = money(w.grossReported + extra);
    return [
      w.id, w.name,
      r.status === "registered-apprentice" ? "RA" : "JW",
      r.status === "registered-apprentice" ? (r.program?.name ?? "") : "",
      w.classification,
      ...DAYS.flatMap((_, i) => [r.dailyST[i] || "", r.dailyOT[i] || ""]),
      r.stHours, r.otHours, w.basePaid.toFixed(2), r.otHours ? w.otRatePaid.toFixed(2) : "",
      (r.fringePaidPerHour - w.cashInLieuPerHour).toFixed(2), w.cashInLieuPerHour.toFixed(2),
      w.grossReported.toFixed(2), extra.toFixed(2), gross.toFixed(2), w.deductions.toFixed(2),
      money(gross - w.deductions).toFixed(2),
    ];
  });
  const meta = [
    [`Draft for review: ${project.contractor} | ${project.name} | Contract ${project.contractNumber} | WD ${project.wd.id} Mod ${project.wd.modification} | Week ending ${project.weekEnding}`],
  ];
  return toCsv([...meta, header, ...rows]);
}
