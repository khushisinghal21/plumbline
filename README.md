# Plumbline

**Certified payroll pre-flight for Davis-Bacon jobs.** Plumbline checks a weekly crew payroll against the
project's wage determination before it is certified. It explains every violation with the arithmetic and the
rule behind it, proposes a correction, waits for a person to approve or dismiss it, and records every step in a
tamper-evident audit trail.

Built by Khushi Singhal as a working pitch for [Lumber](https://www.lumberfi.com), whose platform runs
construction payroll, certified payroll and prevailing-wage compliance, with AI agents that flag exceptions for
human review.

## Why this exists

A certified payroll (WH-347) is a sworn weekly statement. If a worker on a federally funded job is underpaid,
the contractor owes restitution and risks penalties, and falsification can be prosecuted. The common failures
are predictable: a base rate below the wage determination, overtime paid at straight time, an "apprentice"
with no registration, too many apprentices on site on a given day, or a trade missing from the wage
determination entirely.

Plumbline catches those before the payroll is signed, and it keeps a person in charge of every change, which
matches how Lumber describes its agents: they flag exceptions for human review, and write access is off by default.

## What it does

| Area | Behaviour |
|---|---|
| **Prevailing wage** | Every hour must be paid at least basic rate + fringe. Cash, cash in lieu of fringe and creditable plan contributions can be combined (29 CFR 5.5(a)(1)). |
| **Overtime (CWHSSA)** | On contracts over $100,000, hours past 40 in the workweek need 1.5 × the basic rate of pay in cash. Cash in lieu is excluded from the premium (40 U.S.C. 3702). |
| **Apprentice registration** | Reduced rates only for individually registered apprentices in a program for that classification; otherwise the full rate (29 CFR 5.5(a)(4)(i)). |
| **Apprentice ratio** | Measured **daily**, rounded down. Apprentices above the ratio who started on the project last are owed the full rate for that day (29 CFR 5.5(a)(4)(i)(D)). |
| **Classification** | A trade missing from the wage determination blocks sign-off until it is mapped or conformed (SF-1444). |
| **Pay math and timecards** | Reported gross must equal hours × rates paid; days over 16 hours are flagged. |
| **Review queue** | Each finding becomes a proposed correction. Approve it, or dismiss it with a required reason. Sign-off unlocks only when every violation has a decision. |
| **Audit trail** | Append-only log; each entry stores the SHA-256 of the previous entry. `verifyChain()` detects edits and deletions. The UI can simulate an edit to show the break. |
| **Worker pay explanation** | Plain-language English and Spanish explanation of each worker's pay, generated from the same numbers as the checks. |
| **WH-347 draft** | CSV with the data the revised (2025) WH-347 asks for: JW/RA flag, ST/OT hours by day, fringe credit vs. cash in lieu, gross and net, plus approved restitution. |

The engine is deterministic TypeScript with no AI calls, so every dollar figure can be re-derived by hand.

## Sample week

The demo loads an invented 11-person crew on a sample wage determination. It produces 6 violations, 2 warnings
and **$1,290.12** in back pay:

| Worker | Issue | Owed |
|---|---|---|
| Luis Hernández | Over the 1:1 apprentice ratio on Wednesday (one journeyworker off) | $250.32 |
| Kevin O'Brien | Paid as an apprentice with no registration | $834.40 |
| Tyrone Jackson | 6 overtime hours paid at straight time | $95.40 |
| Ana Sofía Torres | Base rate $2.30/hr under the wage determination | $92.00 |
| Ben Whitaker | Cash + in lieu + plans total $0.45/hr short | $18.00 |
| Wei Chen | "Drywall Finisher" not on the wage determination | needs conformance |

## Run it

```bash
npm install
npm test               # 23 unit tests for the rules, audit chain, CSV and explanations
npm run dev            # local app at http://localhost:5173
npm run build:artifact # single self-contained page in dist-artifact/plumbline.html
```

Upload your own week with **Upload timesheet CSV**. **Copy sample as CSV** gives you the expected columns.

## Code map

```
src/engine/types.ts     data model: wage determination, programs, worker week, findings
src/engine/check.ts     the rules engine (runChecks)
src/engine/audit.ts     hash-chained audit log
src/engine/explain.ts   English/Spanish pay explanations
src/engine/export.ts    WH-347-style draft CSV and approved restitution
src/engine/csv.ts       CSV import/export
src/data/sample.ts      invented sample project and crew
src/App.tsx             review queue, crew table, ratio board, audit trail, export
```

## Limits and next steps

- State prevailing wage laws and daily overtime (for example California) are not modelled yet.
- Fringe annualization and union CBA rate sheets are not modelled.
- Wage determinations are sample data; a production version would pull them from SAM.gov and pin the
  modification in effect at bid opening.
- Multi-project weeks, where a worker splits hours across jobs, are not handled.
- A Java/Spring port of the engine would let it run server-side next to payroll.

Informational prototype, not legal advice. All names, rates and contract numbers are invented.
