import { WorkerWeek } from "./types";

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");

export const TEMPLATE_HEADERS = [
  "worker_id", "name", "classification", "role", "apprentice_program_id", "apprentice_registration",
  "apprentice_level_pct", "apprentice_start", "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "base_rate_paid", "ot_rate_paid", "cash_in_lieu_per_hr", "fringe_plan_per_hr", "gross_reported", "deductions", "language",
] as const;

export function workersToCsv(workers: WorkerWeek[]): string {
  return toCsv([
    [...TEMPLATE_HEADERS],
    ...workers.map((w) => [
      w.id, w.name, w.classification, w.role, w.apprentice?.programId ?? "", w.apprentice?.registrationNumber ?? "",
      w.apprentice?.levelPercent ?? "", w.apprentice?.startedOnProject ?? "", ...w.hours,
      w.basePaid, w.otRatePaid, w.cashInLieuPerHour, w.plans.reduce((a, p) => a + p.perHour, 0),
      w.grossReported, w.deductions, w.language,
    ]),
  ]);
}

export function workersFromCsv(text: string): { workers: WorkerWeek[]; errors: string[] } {
  const rows = parseCsv(text.trim());
  const errors: string[] = [];
  if (rows.length < 2) return { workers: [], errors: ["The file needs a header row and at least one worker row."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = TEMPLATE_HEADERS.filter((h) => !header.includes(h) && h !== "language" && h !== "deductions");
  if (missing.length) return { workers: [], errors: [`Missing columns: ${missing.join(", ")}. Copy the template to see the expected format.`] };
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();
  const num = (r: string[], name: string, line: number) => {
    const raw = col(r, name);
    if (raw === "") return 0;
    const n = Number(raw.replace(/[$,]/g, ""));
    if (Number.isNaN(n)) errors.push(`Row ${line}: "${name}" should be a number, got "${raw}".`);
    return Number.isNaN(n) ? 0 : n;
  };
  const workers = rows.slice(1).map((r, idx) => {
    const line = idx + 2;
    const role = col(r, "role").toLowerCase().startsWith("app") ? "apprentice" : "journeyworker";
    const fringe = num(r, "fringe_plan_per_hr", line);
    const w: WorkerWeek = {
      id: col(r, "worker_id") || `W${line}`,
      name: col(r, "name") || `Worker ${line}`,
      classification: col(r, "classification"),
      role,
      hours: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => num(r, d, line)),
      basePaid: num(r, "base_rate_paid", line),
      otRatePaid: num(r, "ot_rate_paid", line),
      cashInLieuPerHour: num(r, "cash_in_lieu_per_hr", line),
      plans: fringe ? [{ plan: "Fringe plans (combined)", perHour: fringe }] : [],
      grossReported: num(r, "gross_reported", line),
      deductions: num(r, "deductions", line),
      language: col(r, "language").toLowerCase() === "es" ? "es" : "en",
    };
    if (role === "apprentice") {
      w.apprentice = {
        programId: col(r, "apprentice_program_id") || undefined,
        registrationNumber: col(r, "apprentice_registration") || undefined,
        levelPercent: num(r, "apprentice_level_pct", line) || 100,
        startedOnProject: col(r, "apprentice_start"),
      };
    }
    if (!w.classification) errors.push(`Row ${line}: classification is empty.`);
    return w;
  });
  return { workers, errors };
}
