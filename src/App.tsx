import React, { useEffect, useMemo, useRef, useState } from "react";
import { sampleProject, sampleWorkers } from "./data/sample";
import { fmt, runChecks } from "./engine/check";
import { AuditEntry, appendEntry, digestOf, verifyChain } from "./engine/audit";
import { workersFromCsv, workersToCsv } from "./engine/csv";
import { Decision, approvedRestitution, wh347DraftCsv } from "./engine/export";
import { explainPay, Lang } from "./engine/explain";
import { DAYS, Finding, Project, WorkerWeek } from "./engine/types";

type Tab = "review" | "crew" | "ratio" | "audit" | "export" | "rules";

const RULE_LABEL: Record<Finding["rule"], string> = {
  WAGE_SHORTFALL: "Prevailing wage",
  OT_PREMIUM: "Overtime",
  APPRENTICE_UNREGISTERED: "Apprentice registration",
  APPRENTICE_RATIO: "Apprentice ratio",
  UNMAPPED_CLASSIFICATION: "Classification",
  GROSS_MISMATCH: "Pay math",
  HOURS_DATA: "Timecard data",
  CWHSSA_NOT_APPLICABLE: "Overtime scope",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function PlumbBob() {
  return (
    <svg className="bob" viewBox="0 0 22 34" aria-hidden="true">
      <line x1="11" y1="0" x2="11" y2="10" stroke="var(--muted)" strokeWidth="1.5" />
      <path d="M5 11 h12 l-6 22 z" fill="var(--accent-fill)" />
      <rect x="7.5" y="9" width="7" height="3" rx="1" fill="var(--ink)" />
    </svg>
  );
}

export default function App() {
  const [project] = useState<Project>(sampleProject);
  const [workers, setWorkers] = useState<WorkerWeek[]>(sampleWorkers);
  const [source, setSource] = useState("Sample week (invented crew and rates)");
  const [reviewer, setReviewer] = useState("Payroll admin");
  const [tab, setTab] = useState<Tab>("review");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [certified, setCertified] = useState<{ by: string; at: string } | null>(null);
  const [log, setLog] = useState<AuditEntry[]>([]);
  const logRef = useRef<AuditEntry[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const result = useMemo(() => runChecks(project, workers), [project, workers]);

  const log$ = (input: { actor: string; action: string; subject?: string | null; detail: string }) => {
    queue.current = queue.current.then(async () => {
      const next = await appendEntry(logRef.current, input);
      logRef.current = next;
      setLog(next);
    });
  };

  // Every run is logged with a fingerprint of its exact input, then one proposal per finding.
  useEffect(() => {
    setDecisions({});
    setCertified(null);
    (async () => {
      const digest = await digestOf({ project, workers });
      log$({
        actor: "Plumbline",
        action: "RUN_CHECKS",
        detail: `${result.totals.workers} workers, ${result.totals.violations} violations, ${result.totals.warnings} warnings, ${fmt(result.totals.owed)} back pay found. Input sha256 ${digest.slice(0, 16)}…`,
      });
      for (const f of result.findings.filter((x) => x.severity !== "info")) {
        log$({ actor: "Plumbline", action: "PROPOSE", subject: f.id, detail: `${f.workerName ?? ""}: ${f.correction.description}` });
      }
    })();
  }, [result]);

  const violations = result.findings.filter((f) => f.severity === "violation");
  const openViolations = violations.filter((f) => !decisions[f.id]);
  const restitution = approvedRestitution(result.findings, decisions);
  const approvedTotal = [...restitution.values()].reduce((a, b) => a + b, 0);

  const decide = (f: Finding, status: Decision["status"], note: string) => {
    const at = new Date().toISOString();
    setDecisions((d) => ({ ...d, [f.id]: { status, note, by: reviewer || "Reviewer", at } }));
    setCertified(null);
    log$({
      actor: reviewer || "Reviewer",
      action: status === "approved" ? "APPROVE" : "DISMISS",
      subject: f.id,
      detail:
        status === "approved"
          ? `${f.workerName ?? ""}: ${f.correction.description}${note ? ` Note: ${note}` : ""}`
          : `${f.workerName ?? ""}: dismissed "${f.title}". Reason: ${note}`,
    });
  };
  const reopen = (f: Finding) => {
    setDecisions((d) => {
      const n = { ...d };
      delete n[f.id];
      return n;
    });
    setCertified(null);
    log$({ actor: reviewer || "Reviewer", action: "REOPEN", subject: f.id, detail: `${f.workerName ?? ""}: decision reopened.` });
  };

  const certify = () => {
    const at = new Date().toISOString();
    const dismissed = violations.filter((f) => decisions[f.id]?.status === "rejected").length;
    setCertified({ by: reviewer || "Reviewer", at });
    log$({
      actor: reviewer || "Reviewer",
      action: "SIGN_OFF",
      detail: `Week ending ${project.weekEnding} signed off. ${violations.length - dismissed} corrections approved (${fmt(approvedTotal)} restitution), ${dismissed} dismissed with reasons.`,
    });
  };

  const loadWorkers = (ws: WorkerWeek[], label: string) => {
    setWorkers(ws);
    setSource(label);
    setTab("review");
  };

  const importCsv = (text: string, label: string) => {
    const { workers: ws, errors } = workersFromCsv(text);
    setImportErrors(errors);
    if (!errors.length && ws.length) {
      loadWorkers(ws, label);
      setPasteOpen(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
    e.target.value = "";
  };

  const copySampleCsv = async () => {
    const csv = workersToCsv(sampleWorkers);
    if (await copyText(csv)) setNotice("Sample CSV copied. Edit it in a spreadsheet, then upload or paste it back.");
    else {
      setPasteText(csv);
      setPasteOpen(true);
      setNotice("Copy the sample CSV from the box below.");
    }
  };

  const state = certified ? "done" : openViolations.length ? "blocked" : "ready";

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          <PlumbBob />
          <div>
            <h1>Plumbline</h1>
            <p>Certified payroll pre-flight for Davis-Bacon jobs</p>
          </div>
        </div>
        <label className="reviewer" htmlFor="reviewer">
          Reviewing as
          <input id="reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        </label>
      </header>

      <section className="sheet" aria-label="Payroll details">
        <div><div className="label">Contractor</div><div className="val">{project.contractor}</div></div>
        <div><div className="label">Project</div><div className="val">{project.name}</div></div>
        <div><div className="label">Contract</div><div className="val">{project.contractNumber}</div></div>
        <div><div className="label">Wage determination</div><div className="val">{project.wd.id} · Mod {project.wd.modification}</div></div>
        <div><div className="label">Week ending</div><div className="val">{project.weekEnding}</div></div>
        <div>
          <div className="label">Contract value</div>
          <div className="val">{fmt(project.contractValue)} <span className="sub" style={{ color: "var(--muted)", fontSize: 13 }}>{result.cwhssaApplies ? "CWHSSA overtime applies" : "Under CWHSSA threshold"}</span></div>
        </div>
      </section>

      <section className="source" aria-label="Payroll data">
        <span className="chip accent">Data: {source}</span>
        <button className="btn small" onClick={() => loadWorkers(sampleWorkers, "Sample week (invented crew and rates)")}>Load sample week</button>
        <label className="btn small" htmlFor="csvfile" style={{ cursor: "pointer" }}>Upload timesheet CSV</label>
        <input id="csvfile" type="file" accept=".csv,text/csv" onChange={onFile} className="visually-hidden" />
        <button className="btn small" onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>Paste CSV</button>
        <button className="btn small" onClick={copySampleCsv}>Copy sample as CSV</button>
        {notice && <span className="chip">{notice}</span>}
      </section>

      {pasteOpen && (
        <section className="panel" aria-label="Paste CSV">
          <textarea id="paste" className="paste" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="worker_id,name,classification,role,…" />
          <div className="actions">
            <button className="btn primary small" onClick={() => importCsv(pasteText, "Pasted CSV")}>Check this payroll</button>
            <button className="btn small" onClick={() => setPasteOpen(false)}>Close</button>
          </div>
        </section>
      )}
      {importErrors.length > 0 && (
        <ul className="errors">{importErrors.map((e) => <li key={e}>{e}</li>)}</ul>
      )}

      <section className={`status ${state === "blocked" ? "" : state}`} aria-live="polite">
        <div>
          {state === "blocked" && (
            <>
              <strong>Not ready to certify</strong>
              <p>{openViolations.length} of {violations.length} violations still need a decision. Approve the correction or dismiss it with a reason.</p>
            </>
          )}
          {state === "ready" && (
            <>
              <strong>Ready for sign-off</strong>
              <p>Every violation has a decision. {fmt(approvedTotal)} in restitution will be added to this week's payroll.</p>
            </>
          )}
          {state === "done" && (
            <>
              <strong>Signed off</strong>
              <p>By {certified!.by} at {new Date(certified!.at).toLocaleString()}. The sign-off is recorded in the audit trail.</p>
            </>
          )}
        </div>
        {state === "ready" && <button className="btn primary" onClick={certify}>Sign off this week</button>}
        {state === "blocked" && <button className="btn" onClick={() => setTab("review")}>Go to review queue</button>}
      </section>

      <section className="figures" aria-label="Summary">
        <div className="fig"><div className="label">Workers</div><div className="num">{result.totals.workers}</div></div>
        <div className="fig"><div className="label">Hours</div><div className="num">{result.totals.hours}</div></div>
        <div className="fig"><div className="label">Violations</div><div className={`num ${result.totals.violations ? "bad" : "ok"}`}>{result.totals.violations}</div></div>
        <div className="fig"><div className="label">Warnings</div><div className={`num ${result.totals.warnings ? "warn" : ""}`}>{result.totals.warnings}</div></div>
        <div className="fig"><div className="label">Back pay found</div><div className={`num ${result.totals.owed ? "bad" : "ok"}`}>{fmt(result.totals.owed)}</div></div>
        <div className="fig"><div className="label">Restitution approved</div><div className="num">{fmt(approvedTotal)}</div></div>
      </section>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {([
          ["review", "Review queue", openViolations.length],
          ["crew", "Crew & pay", null],
          ["ratio", "Apprentice ratio", null],
          ["audit", "Audit trail", log.length],
          ["export", "WH-347 draft", null],
          ["rules", "How it checks", null],
        ] as [Tab, string, number | null][]).map(([id, label, count]) => (
          <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
            {label}
            {count !== null && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>

      {tab === "review" && <ReviewQueue findings={result.findings} decisions={decisions} onDecide={decide} onReopen={reopen} />}
      {tab === "crew" && <Crew result={result} project={project} />}
      {tab === "ratio" && <Ratio result={result} project={project} />}
      {tab === "audit" && <Audit log={log} />}
      {tab === "export" && <Export project={project} result={result} decisions={decisions} />}
      {tab === "rules" && <Rules />}

      <footer>
        <span>Prototype by Khushi Singhal, built as a pitch for Lumber.</span>
        <span>Sample data only. Not legal advice.</span>
        <a href="https://github.com/khushisinghal21" target="_blank" rel="noreferrer">github.com/khushisinghal21</a>
      </footer>
    </div>
  );
}

function ReviewQueue(props: {
  findings: Finding[];
  decisions: Record<string, Decision>;
  onDecide: (f: Finding, s: Decision["status"], note: string) => void;
  onReopen: (f: Finding) => void;
}) {
  const [filter, setFilter] = useState<"open" | "all">("all");
  const list = props.findings.filter((f) => filter === "all" || (!props.decisions[f.id] && f.severity !== "info"));
  return (
    <section className="panel" role="tabpanel" aria-labelledby="tab-review">
      <div className="toolbar">
        <span style={{ color: "var(--muted)", fontSize: 14 }}>
          Plumbline proposes. A person decides. Nothing is written to payroll until a correction is approved.
        </span>
        <div className="seg" role="group" aria-label="Filter findings">
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          <button aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Needs a decision</button>
        </div>
      </div>
      {list.length === 0 && <div className="card" style={{ padding: 16 }}>Nothing waiting. Every finding has a decision.</div>}
      {list.map((f) => (
        <FindingCard key={f.id} f={f} decision={props.decisions[f.id]} onDecide={props.onDecide} onReopen={props.onReopen} />
      ))}
    </section>
  );
}

function FindingCard({ f, decision, onDecide, onReopen }: {
  f: Finding;
  decision?: Decision;
  onDecide: (f: Finding, s: Decision["status"], note: string) => void;
  onReopen: (f: Finding) => void;
}) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const noteId = `note-${f.id}`;
  return (
    <article className={`finding ${f.severity} ${decision ? "decided" : ""}`}>
      <div className="stripe" />
      <div className="body">
        <div className="top">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", alignItems: "baseline" }}>
            <span className={`chip ${f.severity === "violation" ? "bad" : f.severity === "warning" ? "warn" : ""}`}>
              {f.severity === "violation" ? "Violation" : f.severity === "warning" ? "Check" : "Note"} · {RULE_LABEL[f.rule]}
            </span>
            <h3>{f.title}</h3>
            {f.workerName && <span className="who">{f.workerName}</span>}
          </div>
          {f.amountOwed !== null && <span className="owed">{fmt(f.amountOwed)} owed</span>}
        </div>
        <p className="detail">{f.detail}</p>
        {f.correction.type !== "NONE" && (
          <div className="fix">
            <span className="label">Proposed correction</span>
            {f.correction.description}
          </div>
        )}
        <div className="meta">
          <span className="cite">{f.citation}</span>
          <span className="cite">{f.id}</span>
        </div>
        {f.severity !== "info" && !decision && (
          <div className="actions">
            <label htmlFor={noteId} className="visually-hidden">Note for {f.id}</label>
            <input id={noteId} value={note} placeholder="Note (required to dismiss)" onChange={(e) => { setNote(e.target.value); setErr(""); }} />
            <button className="btn approve small" onClick={() => onDecide(f, "approved", note.trim())}>Approve correction</button>
            <button
              className="btn reject small"
              onClick={() => (note.trim() ? onDecide(f, "rejected", note.trim()) : setErr("Add a reason before dismissing."))}
            >
              Dismiss
            </button>
            {err && <span style={{ color: "var(--bad)", fontSize: 13 }}>{err}</span>}
          </div>
        )}
        {decision && (
          <div className="actions">
            <span className={`decision ${decision.status}`}>
              {decision.status === "approved" ? "Approved" : "Dismissed"} by {decision.by}, {new Date(decision.at).toLocaleTimeString()}
              {decision.note ? `. “${decision.note}”` : ""}
            </span>
            <button className="linkish" onClick={() => onReopen(f)}>Reopen</button>
          </div>
        )}
      </div>
    </article>
  );
}

function Crew({ result, project }: { result: ReturnType<typeof runChecks>; project: Project }) {
  const [sel, setSel] = useState<string | null>("W07");
  const selected = result.workers.find((w) => w.worker.id === sel) ?? null;
  const [lang, setLang] = useState<Lang>(selected?.worker.language ?? "en");
  useEffect(() => { if (selected) setLang(selected.worker.language); }, [sel]);
  return (
    <section className="panel" role="tabpanel" aria-labelledby="tab-crew">
      {selected && (
        <div className="explainer">
          <div className="head">
            <h3>Pay explanation for {selected.worker.name}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="seg" role="group" aria-label="Language">
                <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
                <button aria-pressed={lang === "es"} onClick={() => setLang("es")}>Español</button>
              </div>
              <button className="btn small" onClick={() => setSel(null)}>Close</button>
            </div>
          </div>
          {explainPay(selected, project, result.findings, lang).map((p, i) => <p key={i}>{p}</p>)}
          <span style={{ color: "var(--muted)", fontSize: 13 }}>Generated from the same numbers as the checks, so the worker and the payroll team see the same math.</span>
        </div>
      )}
      <div className="legend">
        <span><span className="hr ot">9</span> includes overtime (past 40 hrs)</span>
        <span><span className="hr over">8</span> apprentice over ratio that day</span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Worker</th>
              <th>Status</th>
              {DAYS.map((d) => <th key={d} className="n">{d}</th>)}
              <th className="n">Total</th>
              <th className="n">Required /hr</th>
              <th className="n">Paid /hr</th>
              <th className="n">Owed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {result.workers.map((r) => (
              <tr key={r.worker.id}>
                <td>{r.worker.name}<span className="sub">{r.worker.classification}</span></td>
                <td>
                  {r.status === "registered-apprentice" ? <span className="chip">Apprentice {r.worker.apprentice!.levelPercent}%</span>
                    : r.status === "unregistered-apprentice" ? <span className="chip bad">Unregistered</span>
                    : <span className="chip">Journeyworker</span>}
                </td>
                {DAYS.map((_, i) => {
                  const h = r.worker.hours[i] ?? 0;
                  const cls = !h ? "zero" : r.overRatioDays.includes(i) ? "over" : r.dailyOT[i] > 0 ? "ot" : "";
                  return (
                    <td key={i} className="n" title={r.dailyOT[i] ? `${r.dailyST[i]} straight + ${r.dailyOT[i]} overtime` : undefined}>
                      <span className={`hr ${cls}`}>{h}</span>
                    </td>
                  );
                })}
                <td className="n">{r.totalHours}</td>
                <td className="n">{r.requiredBase === null ? "n/a" : fmt(r.requiredBase + (r.requiredFringe ?? 0))}</td>
                <td className="n">{fmt(r.worker.basePaid + r.fringePaidPerHour)}</td>
                <td className="n" style={{ color: r.owed ? "var(--bad)" : undefined, fontWeight: r.owed ? 600 : undefined }}>{r.owed ? fmt(r.owed) : "–"}</td>
                <td><button className="linkish" onClick={() => setSel(r.worker.id)}>Explain pay</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Ratio({ result, project }: { result: ReturnType<typeof runChecks>; project: Project }) {
  const classes = [...new Set(result.ratioEvents.map((e) => e.classification))];
  return (
    <section className="panel" role="tabpanel" aria-labelledby="tab-ratio">
      <p style={{ margin: 0, maxWidth: "72ch" }}>
        The ratio is checked for each day, not across the week. When there are more registered apprentices on site than
        the program allows, the apprentices who started on the project most recently must be paid the full journeyworker rate for that day.
      </p>
      {classes.length === 0 && <div className="card" style={{ padding: 16 }}>No registered apprentices on this payroll.</div>}
      {classes.map((cls) => {
        const program = project.programs.find((p) => p.classification === cls);
        return (
          <div key={cls} className="panel">
            <div className="label">{cls} · {program?.name} · {program?.journeyworkersPerApprentice} journeyworker{program?.journeyworkersPerApprentice === 1 ? "" : "s"} per apprentice</div>
            <div className="scroll" style={{ border: "none", background: "transparent" }}>
              <div className="days">
                {DAYS.map((d, i) => {
                  const e = result.ratioEvents.find((x) => x.classification === cls && x.day === i);
                  const names = e?.overWorkerIds.map((id) => result.workers.find((w) => w.worker.id === id)?.worker.name).join(", ");
                  return (
                    <div key={d} className={`day ${e && e.overWorkerIds.length ? "bad" : ""}`}>
                      <div className="label">{d}</div>
                      {e ? (
                        <>
                          <span className="k">{e.journeyworkers} JW · {e.apprentices} App</span>
                          <span style={{ fontSize: 13 }}>Allowed {e.allowed}</span>
                          {names ? <span style={{ fontSize: 13, color: "var(--bad)", fontWeight: 600 }}>Over: {names}</span> : <span style={{ fontSize: 13, color: "var(--ok)" }}>Within ratio</span>}
                        </>
                      ) : (
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>No apprentices</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Audit({ log }: { log: AuditEntry[] }) {
  const [tamper, setTamper] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; brokenAt?: number } | null>(null);
  const shown = useMemo(
    () => (tamper && log.length > 2 ? log.map((e) => (e.seq === 2 ? { ...e, detail: e.detail.replace(/\$[\d,.]+/, "$0.00") + " " } : e)) : log),
    [log, tamper],
  );
  useEffect(() => setCheck(null), [log, tamper]);
  return (
    <section className="panel" role="tabpanel" aria-labelledby="tab-audit">
      <div className="toolbar">
        <span style={{ color: "var(--muted)", fontSize: 14, maxWidth: "70ch" }}>
          Each entry stores the SHA-256 hash of the one before it. Editing or deleting any entry breaks the chain from that point on.
        </span>
        <div className="actions">
          <button className="btn small primary" onClick={async () => setCheck(await verifyChain(shown))}>Verify chain</button>
          <button className="btn small" onClick={() => setTamper((t) => !t)} aria-pressed={tamper}>
            {tamper ? "Undo the edit" : "Simulate an edit to entry 2"}
          </button>
        </div>
      </div>
      {check && (
        <div className={`chip ${check.ok ? "ok" : "bad"}`} style={{ justifySelf: "start" }}>
          {check.ok ? `Chain intact: ${shown.length} entries verified` : `Chain broken at entry ${check.brokenAt}: its contents no longer match its hash`}
        </div>
      )}
      <div className="card">
        {shown.map((e) => (
          <div key={e.seq} className={`entry ${check && !check.ok && check.brokenAt === e.seq ? "broken" : ""}`}>
            <span className="seq">#{e.seq}</span>
            <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline" }}>
                <span className="act">{e.action}</span>
                {e.subject && <span className="cite">{e.subject}</span>}
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{e.actor} · {new Date(e.at).toLocaleTimeString()}</span>
              </div>
              <span>{e.detail}</span>
              <span className="hash">hash {e.hash.slice(0, 24)}… · prev {e.prevHash.slice(0, 12)}…</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Export({ project, result, decisions }: { project: Project; result: ReturnType<typeof runChecks>; decisions: Record<string, Decision> }) {
  const csv = wh347DraftCsv(project, result, decisions);
  const [msg, setMsg] = useState("");
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    if (await copyText(csv)) setMsg("Copied. Paste it into a spreadsheet.");
    else {
      const sel = window.getSelection();
      const range = document.createRange();
      if (pre.current && sel) {
        range.selectNodeContents(pre.current);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setMsg("Copy was blocked here, so the text is selected. Press Ctrl+C or Cmd+C.");
    }
  };
  return (
    <section className="panel" role="tabpanel" aria-labelledby="tab-export">
      <p style={{ margin: 0, maxWidth: "74ch" }}>
        A weekly payroll draft with the data the revised WH-347 asks for: journeyworker or apprentice, straight and overtime
        hours by day, fringe credit separate from cash in lieu, gross and net pay. Approved restitution is added as its own column.
        This is a working draft for review, not the official DOL form.
      </p>
      <div className="actions">
        <button className="btn primary small" onClick={copy}>Copy CSV</button>
        {msg && <span className="chip">{msg}</span>}
      </div>
      <pre className="csv" ref={pre}>{csv}</pre>
    </section>
  );
}

function Rules() {
  return (
    <section className="panel prose" role="tabpanel" aria-labelledby="tab-rules">
      <p>
        Plumbline runs fixed rules, not a language model, so every dollar figure can be re-derived by hand. Anything it
        cannot decide becomes a finding for a person. It never edits payroll by itself.
      </p>
      <h3>Checks</h3>
      <ul>
        <li><strong>Prevailing wage.</strong> Every hour must be paid at least the wage determination's basic rate plus fringe. Cash wages, cash in lieu of fringe and creditable plan contributions can be combined to meet it. <span className="cite">29 CFR 5.5(a)(1)</span></li>
        <li><strong>Overtime.</strong> On contracts over $100,000, hours past 40 in the workweek need at least 1.5 × the basic rate of pay in cash. Cash in lieu of fringe is left out of the premium. <span className="cite">40 U.S.C. 3702</span></li>
        <li><strong>Apprentice registration.</strong> Reduced apprentice rates apply only to individually registered apprentices in a program for that classification. Otherwise the full rate applies. <span className="cite">29 CFR 5.5(a)(4)(i)</span></li>
        <li><strong>Apprentice ratio.</strong> Checked per day, rounding down. Apprentices above the ratio who started on the project last are owed the full rate for that day. <span className="cite">29 CFR 5.5(a)(4)(i)(D)</span></li>
        <li><strong>Classification.</strong> A trade missing from the wage determination blocks sign-off until it is mapped or conformed. <span className="cite">29 CFR 5.5(a)(1)(iii)</span></li>
        <li><strong>Pay math and timecards.</strong> Reported gross must equal hours × rates paid. Days over 16 hours are flagged for a foreman check.</li>
      </ul>
      <h3>Not covered yet</h3>
      <ul>
        <li>State prevailing wage laws and daily overtime rules, such as California's.</li>
        <li>Fringe annualization, union CBA rate sheets, and wage determination lookups from SAM.gov.</li>
        <li>Multi-project weeks where a worker splits hours across jobs.</li>
      </ul>
      <h3>Sources</h3>
      <ul>
        <li><a href="https://www.dol.gov/agencies/whd/government-contracts/prevailing-wage-resource-book/db-compliance-principles" target="_blank" rel="noreferrer">DOL WHD: Davis-Bacon compliance principles</a></li>
        <li><a href="https://www.dol.gov/agencies/whd/fact-sheets/66E-DBRA-compliance-fringe-benefit-requirements" target="_blank" rel="noreferrer">DOL Fact Sheet #66E: fringe benefit requirements</a></li>
        <li><a href="https://www.dol.gov/newsroom/releases/whd/whd20251216-0" target="_blank" rel="noreferrer">DOL: fillable and annotated WH-347 (Dec 2025)</a></li>
      </ul>
    </section>
  );
}
