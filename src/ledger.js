import { createHash } from 'node:crypto';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const body = (e) => JSON.stringify({ seq: e.seq, ts: e.ts, type: e.type, data: e.data, prev: e.prev });

/** Append-only log where each entry's hash covers the entry before it. */
export class Ledger {
  entries = [];

  append(type, data) {
    const prev = this.entries.at(-1)?.hash ?? 'GENESIS';
    const e = { seq: this.entries.length + 1, ts: new Date().toISOString(), type, data, prev };
    e.hash = hash(body(e));
    this.entries.push(e);
    return e;
  }

  verify() {
    let prev = 'GENESIS';
    for (const e of this.entries) {
      if (e.prev !== prev || e.hash !== hash(body(e))) return { ok: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { ok: true, brokenAt: null };
  }

  find(type) { return this.entries.find((e) => e.type === type); }
}
