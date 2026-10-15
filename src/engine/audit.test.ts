import { describe, expect, it } from "vitest";
import { appendEntry, GENESIS, verifyChain } from "./audit";
import { parseCsv, workersFromCsv, workersToCsv } from "./csv";
import { sampleWorkers, sampleProject } from "../data/sample";
import { runChecks } from "./check";
import { explainPay } from "./explain";

describe("audit chain", () => {
  it("links each entry to the previous hash", async () => {
    let log = await appendEntry([], { actor: "system", action: "RUN_CHECKS", detail: "a" }, "2026-10-12T00:00:00Z");
    log = await appendEntry(log, { actor: "Priya", action: "APPROVE", subject: "F-001", detail: "b" }, "2026-10-12T00:01:00Z");
    expect(log[0].prevHash).toBe(GENESIS);
    expect(log[1].prevHash).toBe(log[0].hash);
    expect(await verifyChain(log)).toEqual({ ok: true });
  });

  it("detects an edited entry", async () => {
    let log = await appendEntry([], { actor: "system", action: "RUN_CHECKS", detail: "a" });
    log = await appendEntry(log, { actor: "Priya", action: "APPROVE", detail: "pay $92.00" });
    log = await appendEntry(log, { actor: "Priya", action: "CERTIFY", detail: "ok" });
    const tampered = log.map((e) => (e.seq === 2 ? { ...e, detail: "pay $9.20" } : e));
    expect(await verifyChain(tampered)).toEqual({ ok: false, brokenAt: 2 });
  });

  it("detects a deleted entry", async () => {
    let log = await appendEntry([], { actor: "a", action: "x", detail: "1" });
    log = await appendEntry(log, { actor: "a", action: "x", detail: "2" });
    log = await appendEntry(log, { actor: "a", action: "x", detail: "3" });
    expect((await verifyChain([log[0], log[2]])).ok).toBe(false);
  });
});

describe("csv", () => {
  it("parses quoted fields", () => {
    expect(parseCsv('a,"b, c","d ""x"""\n1,2,3')).toEqual([["a", "b, c", 'd "x"'], ["1", "2", "3"]]);
  });

  it("round-trips the sample crew with the same results", () => {
    const { workers, errors } = workersFromCsv(workersToCsv(sampleWorkers));
    expect(errors).toEqual([]);
    expect(runChecks(sampleProject, workers).totals.owed).toBe(runChecks(sampleProject, sampleWorkers).totals.owed);
  });

  it("reports a missing column", () => {
    expect(workersFromCsv("name,mon\nA,8").errors[0]).toMatch(/Missing columns/);
  });
});

describe("pay explanation", () => {
  it("states the amount owed in Spanish", () => {
    const r = runChecks(sampleProject, sampleWorkers);
    const ana = r.workers.find((w) => w.worker.id === "W07")!;
    const text = explainPay(ana, sampleProject, r.findings, "es").join(" ");
    expect(text).toContain("se le deben $92.00");
  });
});
