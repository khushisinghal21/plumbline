// Tamper-evident audit trail: every entry stores the SHA-256 of the previous one.
// Editing or deleting any entry breaks every hash after it, so verifyChain() finds it.

export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  subject: string | null;
  detail: string;
  prevHash: string;
  hash: string;
}

export const GENESIS = "0".repeat(64);

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const canonical = (e: Omit<AuditEntry, "hash">) =>
  JSON.stringify([e.seq, e.at, e.actor, e.action, e.subject, e.detail, e.prevHash]);

export async function appendEntry(
  log: AuditEntry[],
  input: { actor: string; action: string; subject?: string | null; detail: string },
  at: string = new Date().toISOString(),
): Promise<AuditEntry[]> {
  const prev = log[log.length - 1];
  const base = {
    seq: (prev?.seq ?? 0) + 1,
    at,
    actor: input.actor,
    action: input.action,
    subject: input.subject ?? null,
    detail: input.detail,
    prevHash: prev?.hash ?? GENESIS,
  };
  const hash = await sha256Hex(canonical(base));
  return [...log, { ...base, hash }];
}

export async function verifyChain(log: AuditEntry[]): Promise<{ ok: boolean; brokenAt?: number }> {
  let prev = GENESIS;
  for (const e of log) {
    if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq };
    const expected = await sha256Hex(canonical(e));
    if (expected !== e.hash) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true };
}

/** Stable fingerprint of the payroll input, logged so a run can be tied to its exact data. */
export async function digestOf(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}
