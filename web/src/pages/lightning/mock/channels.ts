// A channel as the mock channel page reads it, built from the sample nodes: its two ends in BOLT 7's
// order (the lower key is node one), each end's policy and its last 50 fee changes, and its life.
import type { CloseKind } from "../lightning";
import {
  BREACHED,
  blockTime,
  type ClosedChannel,
  MOCK_NOW,
  type OpenChannel,
  type Peer,
  type Policy,
  type Rng,
  recorded,
  rng,
  sampleNodes,
  scidOf,
  SPLICED,
  SPLICED_INTO,
  stateOf,
  type OpState,
} from "./sample";

export interface FeeChange {
  time: number;
  rate: number;
}

export interface ChannelEnd {
  node: { id: string; alias: string | null };
  policy: Policy | null;
  /** The last 50 changes to its fee rate, oldest first. */
  changes: FeeChange[];
  /** Changes seen in all, of which `changes` keeps the last 50. */
  changeCount: number;
}

export interface SampleChannel {
  id: string;
  scid: string;
  capacity: number;
  state: OpState | "closed";
  one: ChannelEnd;
  two: ChannelEnd;
  funded: {
    height: number;
    time: number;
    txid: string;
    fee: number;
    batch: number;
    continues: string | null;
  };
  verified: number;
  closed: { kind: CloseKind; fee: number; height: number; time: number; txid: string } | null;
  penalty: { height: number; time: number; txid: string } | null;
  continued: string | null;
}

/** How many fee changes a channel keeps per direction. */
export const KEPT_CHANGES = 50;

// When this server's record began (the recorded statistics' first snapshot, 11 Nov 2026), less the
// 90 days the samples pretend it has run.
const RECORD_START = 1_794_504_600 - 90 * 86_400;

/** A seed from a channel id (ASCII digits and x). */
const hash = (s: string) => {
  let h = 7;
  for (let k = 0; k < s.length; k++) h = (Math.imul(h, 31) + (s.codePointAt(k) ?? 0)) >>> 0;
  return h;
};

/** A rate's past: `n` changes from `from` to `to` ending at `last`, stepping as operators do. */
function changes(r: Rng, n: number, start: number, last: number, to: number): FeeChange[] {
  if (n <= 0) return [];
  const out: FeeChange[] = [];
  let rate = Math.max(0, Math.round(to * (0.4 + r.next() * 0.5)));
  for (let k = 0; k < n; k++) {
    const t = Math.round(start + ((last - start) * (k + r.next() * 0.6)) / n);
    rate =
      k === n - 1
        ? to
        : Math.max(0, Math.round(rate + (to - rate) * 0.25 + r.normal() * Math.max(1, to * 0.08)));
    out.push({ time: Math.min(t, last), rate });
  }
  return out;
}

function end(
  r: Rng,
  node: { id: string; alias: string | null },
  policy: Policy | null,
  since: number,
  total: number,
): ChannelEnd {
  const kept = Math.min(KEPT_CHANGES, total);
  const from = total > KEPT_CHANGES ? since + (MOCK_NOW - since) * 0.35 : since;
  return {
    node,
    policy,
    changes: policy ? changes(r, kept, from, policy.last_update, policy.fee_rate) : [],
    changeCount: total,
  };
}

/** Node one is the lower key (BOLT 7); `a` is the node whose list the channel came from. */
function order<T extends { node: { id: string } }>(a: T, b: T): [T, T] {
  return a.node.id < b.node.id ? [a, b] : [b, a];
}

export function sampleChannel(id: string): SampleChannel | undefined {
  for (const node of sampleNodes()) {
    const self = { id: node.id, alias: node.alias };
    const open = node.channels.find((c) => c.id === id);
    if (open) return fromOpen(self, open);
    const closed = node.closed.find((c) => c.id === id);
    if (closed) return fromClosed(self, closed);
  }
  return undefined;
}

function fromOpen(self: { id: string; alias: string | null }, c: OpenChannel): SampleChannel {
  const r = rng(hash(c.id));
  const since = Math.max(c.opened, RECORD_START);
  // The recorded channel keeps its real policies; its fee past is invented.
  const outN = c.id === recorded.id ? 23 : r.int(1, 30);
  const inN = c.id === recorded.id ? 3 : r.int(1, 12);
  const mine = end(r, self, c.out, since, outN);
  const theirs = end(r, peerRef(c.peer), c.in, since, inN);
  const [one, two] = order(mine, theirs);
  return {
    id: c.id,
    scid: c.scid,
    capacity: c.capacity,
    state: stateOf(c.out, c.in),
    one,
    two,
    funded: {
      height: c.height,
      time: c.opened,
      txid: c.id === recorded.id ? (recorded.funding.txid ?? r.hex(64)) : r.hex(64),
      fee: r.int(180, 2400),
      batch: c.batch,
      continues: c.id === SPLICED_INTO ? SPLICED : null,
    },
    verified: Math.max(c.opened + 6 * 600, RECORD_START),
    closed: null,
    penalty: null,
    continued: null,
  };
}

const peerRef = (p: Peer) => ({ id: p.id, alias: p.alias });

function fromClosed(self: { id: string; alias: string | null }, c: ClosedChannel): SampleChannel {
  const r = rng(hash(c.id));
  const height = Number(c.id.split("x")[0]);
  // A closed channel's last policies, as they stood at the close: the server would keep them with
  // the fee changes, since gossip forgets a closed channel's.
  const last = (rate: number, base: number, cltv: number, minHtlc: number): Policy => ({
    fee_rate: rate,
    base_fee_msat: base,
    cltv_delta: cltv,
    min_htlc_msat: minHtlc,
    max_htlc_msat: c.capacity * 990,
    enabled: c.kind === "cooperative" || c.kind === "other",
    last_update: c.closedTime - r.int(3600, 6 * 86_400),
  });
  const since = Math.max(c.opened, RECORD_START);
  const mine = end(
    r,
    self,
    last(
      c.id === BREACHED ? 250 : 900,
      c.id === BREACHED ? 0 : 1000,
      c.id === BREACHED ? 80 : 144,
      1,
    ),
    since,
    r.int(2, 14),
  );
  const theirs = end(
    r,
    peerRef(c.peer),
    last(c.id === BREACHED ? 5 : r.pick([1, 50, 210]), 1000, 40, 1000),
    since,
    r.int(1, 6),
  );
  const [one, two] = order(mine, theirs);
  return {
    id: c.id,
    scid: scidOf(c.id),
    capacity: c.capacity,
    state: "closed",
    one,
    two,
    funded: {
      height,
      time: blockTime(height),
      txid: r.hex(64),
      fee: r.int(180, 1800),
      batch: c.id === SPLICED ? 2 : 0,
      continues: null,
    },
    verified: Math.max(blockTime(height) + 6 * 600, RECORD_START),
    closed: {
      kind: c.kind === "penalty" ? "force" : c.kind,
      fee: c.fee,
      height: c.closedHeight,
      time: c.closedTime,
      txid: c.txid,
    },
    penalty:
      c.kind === "penalty"
        ? {
            height: c.closedHeight + 3,
            time: blockTime(c.closedHeight + 3),
            txid: "c84e1f07a3b95d2e6f10a8c4b7e39d5a2f61c0e8b4d7a93f5e2c1b0a6d8f4e37",
          }
        : null,
    continued: c.continued,
  };
}

/** The three hand-made samples, for the mockups' links. */
export const CHANNEL_SAMPLES = [recorded.id, BREACHED, SPLICED] as const;
