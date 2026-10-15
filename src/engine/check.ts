import {
  ApprenticeProgram,
  ApprenticeStatus,
  CheckResult,
  DAYS,
  Finding,
  Project,
  RatioEvent,
  WageRate,
  WorkerResult,
  WorkerWeek,
} from "./types";

/**
 * Deterministic Davis-Bacon pre-flight checks for one weekly certified payroll.
 *
 * Every number in a finding comes from arithmetic on the inputs, so a reviewer
 * can re-derive it by hand. Nothing here guesses; anything ambiguous becomes a
 * finding for a human to decide.
 *
 * Rules applied (informational, not legal advice):
 *  - Each hour owes the full prevailing wage (basic rate + fringe). Cash and
 *    creditable fringe contributions can be combined to meet it (29 CFR 5.5(a)(1), 5.23).
 *  - Hours over 40 in the workweek owe a half-time premium on the basic rate of
 *    pay, on contracts over $100,000 (CWHSSA, 40 U.S.C. 3702). Cash in lieu of
 *    fringe is excluded from that premium.
 *  - Reduced apprentice rates apply only to individually registered apprentices,
 *    and only within the program's ratio, measured daily. Apprentices above the
 *    ratio (latest to start on the project) must be paid the full journeyworker
 *    rate for that day (29 CFR 5.5(a)(4)(i)).
 */

export const CWHSSA_THRESHOLD = 100_000;
const EPS = 0.005;

export const money = (n: number) => Math.round(n * 100) / 100;
export const fmt = (n: number) =>
  "$" + money(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} hr${n === 1 ? "" : "s"}`;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function apprenticeStatus(w: WorkerWeek, programs: ApprenticeProgram[]): {
  status: ApprenticeStatus;
  program: ApprenticeProgram | null;
  reason?: string;
} {
  if (w.role !== "apprentice") return { status: "journeyworker", program: null };
  const a = w.apprentice;
  if (!a || !a.registrationNumber || !a.registrationNumber.trim()) {
    return { status: "unregistered-apprentice", program: null, reason: "no apprenticeship registration number on file" };
  }
  const program = programs.find((p) => p.id === a.programId) ?? null;
  if (!program) {
    return { status: "unregistered-apprentice", program: null, reason: `program "${a.programId ?? "none"}" is not a registered program for this project` };
  }
  if (norm(program.classification) !== norm(w.classification)) {
    return {
      status: "unregistered-apprentice",
      program,
      reason: `registered program trains ${program.classification}, not ${w.classification}`,
    };
  }
  return { status: "registered-apprentice", program };
}

/** Split each day's hours into straight time and overtime (hours past 40 in the week, in day order). */
export function splitOvertime(hours: number[]): { st: number[]; ot: number[] } {
  let cum = 0;
  const st: number[] = [];
  const ot: number[] = [];
  for (const h of hours) {
    const room = Math.max(0, 40 - cum);
    const s = Math.min(h, room);
    st.push(s);
    ot.push(h - s);
    cum += h;
  }
  return { st, ot };
}

/** Daily apprentice ratio check per classification. */
export function ratioCheck(
  workers: WorkerWeek[],
  statusById: Map<string, { status: ApprenticeStatus; program: ApprenticeProgram | null }>,
): RatioEvent[] {
  const events: RatioEvent[] = [];
  const classes = new Set(
    workers.filter((w) => statusById.get(w.id)?.status === "registered-apprentice").map((w) => norm(w.classification)),
  );
  for (const cls of classes) {
    for (let d = 0; d < 7; d++) {
      const journey = workers.filter(
        (w) => norm(w.classification) === cls && statusById.get(w.id)?.status === "journeyworker" && (w.hours[d] ?? 0) > 0,
      );
      const apprentices = workers
        .filter(
          (w) =>
            norm(w.classification) === cls &&
            statusById.get(w.id)?.status === "registered-apprentice" &&
            (w.hours[d] ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (a.apprentice?.startedOnProject ?? "").localeCompare(b.apprentice?.startedOnProject ?? "") ||
            a.name.localeCompare(b.name),
        );
      if (apprentices.length === 0) continue;
      const program = statusById.get(apprentices[0].id)!.program!;
      // No "fraction thereof": round down unless the program says otherwise.
      const allowed = Math.floor(journey.length / program.journeyworkersPerApprentice);
      const over = apprentices.slice(allowed).map((w) => w.id);
      events.push({
        day: d,
        classification: apprentices[0].classification,
        journeyworkers: journey.length,
        apprentices: apprentices.length,
        allowed,
        overWorkerIds: over,
      });
    }
  }
  return events;
}

export function runChecks(project: Project, workers: WorkerWeek[]): CheckResult {
  const rates = new Map<string, WageRate>(project.wd.rates.map((r) => [norm(r.classification), r]));
  const cwhssaApplies = project.contractValue > CWHSSA_THRESHOLD;
  const findings: Finding[] = [];
  let seq = 0;
  const add = (f: Omit<Finding, "id">) => {
    const id = `F-${String(++seq).padStart(3, "0")}`;
    findings.push({ ...f, id });
    return id;
  };

  const statusById = new Map(workers.map((w) => [w.id, apprenticeStatus(w, project.programs)]));
  const ratioEvents = ratioCheck(workers, statusById);
  const overRatio = new Map<string, number[]>();
  for (const e of ratioEvents) for (const id of e.overWorkerIds) overRatio.set(id, [...(overRatio.get(id) ?? []), e.day]);

  if (!cwhssaApplies) {
    add({
      rule: "CWHSSA_NOT_APPLICABLE",
      severity: "info",
      title: "Federal contract overtime rule not applied",
      detail: `The contract value (${fmt(project.contractValue)}) is at or below ${fmt(CWHSSA_THRESHOLD)}, so CWHSSA overtime was not checked. FLSA or state overtime may still apply.`,
      citation: "40 U.S.C. 3701(b)(3)(A)(iii)",
      amountOwed: null,
      correction: { type: "NONE", description: "No action. Confirm state overtime rules separately." },
    });
  }

  const results: WorkerResult[] = workers.map((w) => {
    const ids: string[] = [];
    const { status, program, reason } = statusById.get(w.id)!;
    const rate = rates.get(norm(w.classification)) ?? null;
    const hours = DAYS.map((_, i) => Number(w.hours[i] ?? 0));
    const totalHours = hours.reduce((a, b) => a + b, 0);
    const { st, ot } = splitOvertime(hours);
    const stHours = st.reduce((a, b) => a + b, 0);
    const otHours = ot.reduce((a, b) => a + b, 0);
    const fringePaidPerHour = w.cashInLieuPerHour + w.plans.reduce((a, p) => a + p.perHour, 0);
    const computedGross = money(stHours * w.basePaid + otHours * w.otRatePaid + totalHours * w.cashInLieuPerHour);
    const overDays = overRatio.get(w.id) ?? [];
    let owed = 0;

    // Data quality: implausible daily hours.
    const badDays = hours.map((h, i) => ({ h, i })).filter(({ h }) => h < 0 || h > 16);
    if (badDays.length) {
      ids.push(
        add({
          rule: "HOURS_DATA",
          severity: "warning",
          workerId: w.id,
          workerName: w.name,
          title: "Unusual daily hours",
          detail: `${badDays.map(({ h, i }) => `${DAYS[i]}: ${hrs(h)}`).join(", ")} recorded. Days over 16 hours (or negative hours) are usually a timecard entry error.`,
          citation: "29 CFR 5.5(a)(3)(i) (accurate daily and weekly hours)",
          amountOwed: null,
          correction: { type: "VERIFY_DATA", description: `Confirm ${w.name}'s hours against the foreman's daily log before certifying.` },
        }),
      );
    }

    // Pay math: reported gross vs hours x rates actually paid.
    if (Math.abs(computedGross - w.grossReported) > 0.01) {
      ids.push(
        add({
          rule: "GROSS_MISMATCH",
          severity: "warning",
          workerId: w.id,
          workerName: w.name,
          title: "Reported gross pay does not match hours × rates",
          detail: `${hrs(stHours)} × ${fmt(w.basePaid)}${otHours ? ` + ${hrs(otHours)} × ${fmt(w.otRatePaid)}` : ""}${w.cashInLieuPerHour ? ` + ${hrs(totalHours)} × ${fmt(w.cashInLieuPerHour)} in lieu` : ""} = ${fmt(computedGross)}, but the payroll reports ${fmt(w.grossReported)} (difference ${fmt(Math.abs(computedGross - w.grossReported))}).`,
          citation: "29 CFR 5.5(a)(3)(i) (payroll records)",
          amountOwed: null,
          correction: {
            type: "FIX_RECORD",
            description: `Correct the reported gross (${fmt(w.grossReported)}) to ${fmt(computedGross)}, or attach the reason for the difference.`,
          },
        }),
      );
    }

    if (!rate) {
      ids.push(
        add({
          rule: "UNMAPPED_CLASSIFICATION",
          severity: "violation",
          workerId: w.id,
          workerName: w.name,
          title: `"${w.classification}" is not on the wage determination`,
          detail: `Wage determination ${project.wd.id} has no rate for "${w.classification}", so the required wage cannot be checked. Work must be paid under a listed classification that matches local practice, or an added classification must be approved through conformance.`,
          citation: "29 CFR 5.5(a)(1)(iii) (conformance, SF-1444)",
          amountOwed: null,
          correction: {
            type: "CONFORMANCE",
            description: `Map ${w.name} to a listed classification, or submit a conformance request (SF-1444) before certifying this payroll.`,
          },
        }),
      );
      return {
        worker: w, status, rate, program, totalHours, stHours, otHours, dailyST: st, dailyOT: ot,
        overRatioDays: overDays, requiredBase: null, requiredFringe: null, fringePaidPerHour, computedGross, owed: 0, findingIds: ids,
      };
    }

    const level = (w.apprentice?.levelPercent ?? 100) / 100;
    const reqFor = (d: number) => {
      if (status === "registered-apprentice" && !overDays.includes(d)) {
        return {
          base: rate.base * level,
          fringe: program!.fringeRule === "full" ? rate.fringe : rate.fringe * level,
        };
      }
      return { base: rate.base, fringe: rate.fringe };
    };
    const normal = reqFor(-1);

    // 1) Prevailing wage on every hour (cash + creditable fringe combined).
    const pkgPaid = w.basePaid + fringePaidPerHour;
    const byCause = { shortfall: 0, ratio: 0, unreg: 0 };
    const ratioDetail: string[] = [];
    let shortHrs = 0;
    for (let d = 0; d < 7; d++) {
      if (!hours[d]) continue;
      const req = reqFor(d);
      const short = Math.max(0, req.base + req.fringe - pkgPaid);
      if (short <= EPS) continue;
      const amt = short * hours[d];
      if (status === "unregistered-apprentice") byCause.unreg += amt;
      else if (overDays.includes(d)) {
        byCause.ratio += amt;
        ratioDetail.push(`${DAYS[d]} ${hrs(hours[d])}`);
      } else {
        byCause.shortfall += amt;
        shortHrs += hours[d];
      }
    }
    const reqTotal = normal.base + normal.fringe;
    const paidLine = `Paid ${fmt(w.basePaid)} cash${w.cashInLieuPerHour ? ` + ${fmt(w.cashInLieuPerHour)} in lieu of fringe` : ""} + ${fmt(fringePaidPerHour - w.cashInLieuPerHour)} fringe credit = ${fmt(pkgPaid)}/hr`;

    if (byCause.shortfall > EPS) {
      owed += byCause.shortfall;
      const who = status === "registered-apprentice" ? `${w.apprentice!.levelPercent}% apprentice level: ` : "";
      ids.push(
        add({
          rule: "WAGE_SHORTFALL",
          severity: "violation",
          workerId: w.id,
          workerName: w.name,
          title: "Paid below the prevailing wage",
          detail: `Required for ${w.classification} (${who}${fmt(normal.base)} base + ${fmt(normal.fringe)} fringe) = ${fmt(reqTotal)}/hr. ${paidLine}. Short ${fmt(reqTotal - pkgPaid)}/hr × ${hrs(shortHrs)} = ${fmt(byCause.shortfall)}.`,
          citation: "40 U.S.C. 3142; 29 CFR 5.5(a)(1)",
          amountOwed: money(byCause.shortfall),
          correction: {
            type: "BACK_PAY",
            description: `Pay ${w.name} ${fmt(byCause.shortfall)} in restitution and add an adjustment line to this week's certified payroll.`,
          },
        }),
      );
    }

    if (byCause.unreg > EPS) {
      owed += byCause.unreg;
      const full = rate.base + rate.fringe;
      ids.push(
        add({
          rule: "APPRENTICE_UNREGISTERED",
          severity: "violation",
          workerId: w.id,
          workerName: w.name,
          title: "Apprentice rate used without a valid registration",
          detail: `${w.name} is paid as an apprentice, but ${reason}. Reduced apprentice rates apply only to individually registered apprentices, so the full ${w.classification} rate applies: ${fmt(rate.base)} + ${fmt(rate.fringe)} = ${fmt(full)}/hr. ${paidLine}. Short ${fmt(full - pkgPaid)}/hr × ${hrs(totalHours)} = ${fmt(byCause.unreg)}.`,
          citation: "29 CFR 5.5(a)(4)(i)",
          amountOwed: money(byCause.unreg),
          correction: {
            type: "BACK_PAY",
            description: `Pay ${w.name} ${fmt(byCause.unreg)} at the full journeyworker rate, or attach a valid registration certificate if one exists.`,
          },
        }),
      );
    }

    if (byCause.ratio > EPS) {
      owed += byCause.ratio;
      const full = rate.base + rate.fringe;
      const evs = ratioEvents.filter((e) => e.overWorkerIds.includes(w.id));
      const ev = evs[0];
      ids.push(
        add({
          rule: "APPRENTICE_RATIO",
          severity: "violation",
          workerId: w.id,
          workerName: w.name,
          title: "Apprentice ratio exceeded",
          detail: `On ${evs.map((e) => DAYS[e.day]).join(", ")}, ${ev.journeyworkers} journeyworker ${w.classification}${ev.journeyworkers === 1 ? " was" : "s were"} on site, which allows ${ev.allowed} apprentice${ev.allowed === 1 ? "" : "s"} under ${program!.name}'s ratio (${program!.journeyworkersPerApprentice} journeyworker${program!.journeyworkersPerApprentice === 1 ? "" : "s"} per apprentice). ${ev.apprentices} apprentices worked, and ${w.name} started on the project last, so those hours (${ratioDetail.join(", ")}) must be paid at the full rate of ${fmt(full)}/hr. ${paidLine}. Owed ${fmt(byCause.ratio)}.`,
          citation: "29 CFR 5.5(a)(4)(i)(D) (ratio measured daily)",
          amountOwed: money(byCause.ratio),
          correction: {
            type: "BACK_PAY",
            description: `Pay ${w.name} ${fmt(byCause.ratio)} for the over-ratio day(s), and schedule enough journeyworkers alongside apprentices.`,
          },
        }),
      );
    }

    // 2) Overtime premium on hours over 40 (CWHSSA).
    if (cwhssaApplies && otHours > 0) {
      let otShort = 0;
      let basic = 0;
      for (let d = 0; d < 7; d++) {
        if (!ot[d]) continue;
        basic = Math.max(w.basePaid, reqFor(d).base);
        const premiumPaid = w.otRatePaid - w.basePaid;
        otShort += Math.max(0, 0.5 * basic - premiumPaid) * ot[d];
      }
      if (otShort > EPS) {
        owed += otShort;
        ids.push(
          add({
            rule: "OT_PREMIUM",
            severity: "violation",
            workerId: w.id,
            workerName: w.name,
            title: "Overtime premium underpaid",
            detail: `${hrs(totalHours)} worked, so ${hrs(otHours)} are over 40. Overtime must be at least 1.5 × the basic rate (${fmt(basic)}) = ${fmt(1.5 * basic)}/hr in cash, plus fringe. Paid ${fmt(w.otRatePaid)}/hr. Short ${fmt(otShort / otHours)}/hr × ${hrs(otHours)} = ${fmt(otShort)}.`,
            citation: "40 U.S.C. 3702 (CWHSSA)",
            amountOwed: money(otShort),
            correction: {
              type: "BACK_PAY",
              description: `Pay ${w.name} ${fmt(otShort)} in overtime restitution and correct the overtime rate in payroll setup.`,
            },
          }),
        );
      }
    }

    return {
      worker: w, status, rate, program, totalHours, stHours, otHours, dailyST: st, dailyOT: ot,
      overRatioDays: overDays, requiredBase: normal.base, requiredFringe: normal.fringe, fringePaidPerHour,
      computedGross, owed: money(owed), findingIds: ids,
    };
  });

  const order = { violation: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    workers: results,
    findings,
    ratioEvents,
    cwhssaApplies,
    totals: {
      workers: results.length,
      hours: results.reduce((a, r) => a + r.totalHours, 0),
      violations: findings.filter((f) => f.severity === "violation").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      owed: money(results.reduce((a, r) => a + r.owed, 0)),
    },
  };
}
