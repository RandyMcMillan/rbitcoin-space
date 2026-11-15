// Sample data for the Lightning mockups (docs: none; nothing here ships). Real recorded answers
// from fixtures/lightning/app where they exist, copied into samples/, and seeded invented values
// around them where the new features need fields the server does not serve yet. Everything is
// built once, on first use, with a fixed seed, so every load and every screenshot is the same.
import { sorted } from "../../../components/chart/geometry";
import acinqJson from "./samples/node-acinq.json";
import channelJson from "./samples/channel-811984x2037x0.json";
import overviewJson from "./samples/overview.json";
import rankingsJson from "./samples/rankings-capacity.json";
import type {
  ChannelDetail,
  CloseKind,
  ListedChannel,
  NodeDetail,
  Feature,
  RankedNode,
  Stats,
} from "../lightning";

/** The moment the samples were taken: the recorded answers' own time, 12 Nov 2026, 17:50 UTC. */
export const MOCK_NOW = 1_794_594_650;
/** The newest block in the samples (the recorded status's). */
export const TIP = 975_579;
const DAY = 86_400;

const acinq = acinqJson as NodeDetail;
const recordedChannel = channelJson as ChannelDetail;
export const recordedOverview = overviewJson as unknown as {
  statistics: Stats;
  top_capacity: RankedNode[];
  top_channels: RankedNode[];
  opened: ListedChannel[];
};
export const rankings = (rankingsJson as { nodes: RankedNode[] }).nodes;

// A small seeded generator (mulberry32): the same numbers on every load.
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
  const normal = () => {
    const u = Math.max(next(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  const hex = (n: number) => Array.from({ length: n }, () => int(0, 15).toString(16)).join("");
  return { next, int, pick, normal, hex };
}
export type Rng = ReturnType<typeof rng>;

/** A block's time from its height: two recorded blocks and ten minutes a block between and beyond. */
export function blockTime(height: number): number {
  if (height >= 811_984) return 1_697_189_564 + Math.round((height - 811_984) * 594.9);
  return 1_697_189_564 + (height - 811_984) * 600;
}

/** The 64-bit short channel id in decimal, from its three parts. */
export function scidOf(id: string): string {
  const [h = 0n, i = 0n, o = 0n] = id.split("x").map(BigInt);
  return ((h << 40n) | (i << 16n) | o).toString();
}

// The shapes the new features read. Each says which field the server would have to add.

export interface Policy {
  fee_rate: number;
  base_fee_msat: number;
  cltv_delta: number;
  min_htlc_msat: number;
  max_htlc_msat: number;
  enabled: boolean;
  last_update: number;
  /** The inbound fee: what this end takes off for a payment arriving over the channel (lnd's
   *  inbound fee, a discount, so zero or negative). Read from an extra field of the channel update. */
  inbound_rate: number;
  inbound_base_msat: number;
}

/** A channel's state as an operator reads it: which end, if any, switched it off. */
export type OpState = "active" | "here" | "peer" | "inactive";

export interface Peer {
  id: string;
  alias: string | null;
  /** The peer's own size, so a reader can judge it without leaving the table. */
  channels: number;
  capacity: number;
}

export interface OpenChannel {
  id: string;
  scid: string;
  capacity: number;
  peer: Peer;
  height: number;
  opened: number;
  /** Other channels funded by the same transaction. */
  batch: number;
  out: Policy | null;
  in: Policy | null;
  state: OpState;
  last_update: number;
}

export interface ClosedChannel {
  id: string;
  peer: Peer;
  capacity: number;
  kind: CloseKind;
  /** The new channel a cooperative or "other" close was really spliced into. */
  continued: string | null;
  fee: number;
  opened: number;
  closedHeight: number;
  closedTime: number;
  txid: string;
}

export interface HistoryPoint {
  time: number;
  channels: number;
  capacity: number;
}

export interface SampleNode {
  id: string;
  alias: string | null;
  color: string | null;
  socket: string | null;
  addresses: string[];
  rank: { capacity: number; channels: number };
  last_update: number;
  first_seen: number;
  channels: OpenChannel[];
  closed: ClosedChannel[];
  history: HistoryPoint[];
  features: Feature[];
}

/** What was observed: an end with no policy (none sent, or older than two weeks) is "no recent
 *  policy", whatever the other end says; a policy that says disabled names its end. */
/** Which end's policy is missing or old, in a few words; null when both are current. */
export function policyGap(c: { out: Policy | null; in: Policy | null }): string | null {
  if (!c.in) return "Peer policy missing";
  if (!c.out) return "Own policy missing";
  if (isOld(c.in)) return "Peer policy old";
  if (isOld(c.out)) return "Own policy old";
  return null;
}

/** A policy older than two weeks, which LDK no longer counts as current. */
export const isOld = (p: Policy): boolean => MOCK_NOW - p.last_update > 14 * DAY;

/** "inactive" is shown as "Policy incomplete": an end's policy is missing or older than two weeks. */
export function stateOf(out: Policy | null, inn: Policy | null): OpState {
  if (!out || !inn || isOld(out) || isOld(inn)) return "inactive";
  if (!out.enabled) return "here";
  if (!inn.enabled) return "peer";
  return "active";
}

/** The bucket a rate falls in, as the server buckets them: exact under 10, then tens, hundreds, thousands. */
function bucketTop(bucket: number): number {
  if (bucket < 10) return bucket;
  const step = bucket < 100 ? 10 : bucket < 1000 ? 100 : 1000;
  return bucket + step - 1;
}

/** Rates spread as a node's recorded histogram spreads them, shuffled; null for "no policy". */
function ratesFrom(
  r: Rng,
  buckets: readonly { bucket: number | null; count: number }[],
): (number | null)[] {
  const out: (number | null)[] = [];
  for (const b of buckets) {
    for (let k = 0; k < b.count; k++) {
      if (b.bucket === null) out.push(null);
      else {
        const top = bucketTop(b.bucket);
        out.push(r.pick([b.bucket, top, b.bucket, Math.round((b.bucket + top) / 2)]));
      }
    }
  }
  for (let k = out.length - 1; k > 0; k--) {
    const j = Math.floor(r.next() * (k + 1));
    [out[k], out[j]] = [out[j] ?? null, out[k] ?? null];
  }
  return out;
}

// Invented peers: plausible names in the styles real aliases take, one of them markup that must
// read as text, and one node that announced no name at all.
const NAME_A = [
  "satoshi",
  "nordic",
  "volt",
  "kestrel",
  "harbor",
  "copper",
  "lumen",
  "orbit",
  "granite",
  "tundra",
  "zephyr",
  "maple",
  "cobalt",
  "quarry",
  "ember",
  "fjord",
];
const NAME_B = ["-ln", "-node", " relay", "_lnd", "-cln", " hub", "⚡", "-eclair", " routing", ""];
const ODD_NAMES = ["<b>not bold</b>", "‮reversed‬ name", "🦀🦀🦀", null];

function invent(r: Rng, n: number): Peer {
  const alias =
    n % 97 === 13
      ? (ODD_NAMES[Math.floor(n / 97) % ODD_NAMES.length] ?? null)
      : `${r.pick(NAME_A)}${r.pick(NAME_B)}${r.next() < 0.3 ? String(r.int(1, 9)) : ""}`;
  const channels = Math.max(1, Math.round(Math.exp(r.normal() * 1.1 + 2)));
  const capacity = Math.round((channels * Math.exp(r.normal() * 0.8 + 14.8)) / 1000) * 1000;
  return { id: `0${r.pick(["2", "3"])}${r.hex(64)}`, alias, channels, capacity };
}

const rankedPeer = (n: RankedNode): Peer => ({
  id: n.id,
  alias: n.alias,
  channels: n.channels,
  capacity: n.capacity,
});

function policy(
  r: Rng,
  rate: number | null,
  base: number,
  cltv: number,
  capacity: number,
  minHtlc: number,
  offChance: number,
): Policy | null {
  if (rate === null) return null;
  return {
    fee_rate: rate,
    base_fee_msat: base,
    cltv_delta: cltv,
    min_htlc_msat: minHtlc,
    max_htlc_msat: r.next() < 0.6 ? Math.floor(capacity * 990) : capacity * 1000,
    enabled: r.next() >= offChance,
    last_update: MOCK_NOW - (r.next() < 0.85 ? r.int(600, 2 * DAY) : r.int(2 * DAY, 13 * DAY)),
    inbound_rate: 0,
    inbound_base_msat: 0,
  };
}

// Inbound discounts come from their own stream, so adding them left every other sample unchanged.
const discounts = rng(4242);

/** Gives about one peer policy in eight an inbound discount, as lnd nodes that use them do. */
function discount(p: Policy | null): Policy | null {
  if (p && discounts.next() < 0.12) {
    p.inbound_rate = -discounts.pick([25, 50, 100, 200]);
    p.inbound_base_msat = discounts.pick([0, 0, -1000]);
  }
  // A few peers went quiet: their last policy is over two weeks old.
  if (p && discounts.next() < 0.03) p.last_update = MOCK_NOW - discounts.int(15, 40) * DAY;
  return p;
}

/** A recorded policy, which predates inbound fees in our shapes: none advertised. */
const recordedPolicy = (p: Omit<Policy, "inbound_rate" | "inbound_base_msat">): Policy => ({
  ...p,
  inbound_rate: 0,
  inbound_base_msat: 0,
});

function channel(
  r: Rng,
  id: string,
  capacity: number,
  peer: Peer,
  out: Policy | null,
  inn: Policy | null,
): OpenChannel {
  const height = Number(id.split("x")[0]);
  const state = stateOf(out, inn);
  return {
    id,
    scid: scidOf(id),
    capacity,
    peer,
    height,
    opened: blockTime(height),
    batch: r.next() < 0.05 ? r.int(1, 4) : 0,
    out,
    in: inn,
    state,
    // The older of the two known policies: how fresh the pair being compared is.
    last_update: Math.min(out?.last_update ?? Infinity, inn?.last_update ?? Infinity),
  };
}

/** A funding height, weighted to the last two years as real channels are. */
const height = (r: Rng, lo = 560_000) => Math.round(TIP - 7 - (TIP - lo) * r.next() ** 2.2);

const txid = (r: Rng) => r.hex(64);

/** The small sample node: invented (a real node's channels are not ours to make up). */
export const SMALL_KEY = "02b6e1f4a3c8d905e2174a6f3b9c0d81e5a72f4c6b8d903e1a5f7c2b4d6e8f0a13";
/** The channel ACINQ and the small node share, so each lists the other. */
const SHARED = "952113x1874x1";
/** The cooperative close that was a splice, and the channel it continued as. */
export const SPLICED = "948730x2215x0";
export const SPLICED_INTO = "975402x1310x1";
/** The force close that a penalty swept. */
export const BREACHED = "958844x904x1";

let acinqSample: SampleNode | undefined;
let smallSample: SampleNode | undefined;

export function sampleNodes(): SampleNode[] {
  return [largeNode(), smallNode()];
}

export function sampleNode(key: string): SampleNode | undefined {
  return sampleNodes().find((n) => n.id === key.toLowerCase());
}

const smallPeer = (): Peer => ({
  id: SMALL_KEY,
  alias: "pinecone-relay",
  channels: 7,
  capacity: 13_250_000,
});

/** ACINQ as recorded (its key, name, colour, addresses, its 25 largest channels and fee spread),
 *  with the rest of its 1 807 channels, its closes and its past invented to match. */
function largeNode(): SampleNode {
  if (acinqSample) return acinqSample;
  const r = rng(1807);
  const byId = new Map(rankings.map((n) => [n.id, n]));
  const outRates = ratesFrom(r, acinq.fees.outgoing);
  const inRates = ratesFrom(r, acinq.fees.incoming);
  const real = acinq.open_channels.channels;
  // The recorded largest channels keep their real rate; take one from its bucket for each.
  for (const c of real) {
    const k = outRates.findIndex(
      (x) => x !== null && c.fee_rate !== null && bucketTop(x) >= c.fee_rate && x <= c.fee_rate,
    );
    if (k !== -1) outRates.splice(k, 1);
  }
  const channels: OpenChannel[] = [];
  const minHtlc = 1;
  for (const c of real) {
    const ranked = byId.get(c.peer.id);
    const peer = ranked
      ? rankedPeer(ranked)
      : {
          id: c.peer.id,
          alias: c.peer.alias,
          channels: r.int(40, 300),
          capacity: r.int(5, 60) * 1e8,
        };
    const out = policy(r, c.fee_rate, 1000, 144, c.capacity, minHtlc, 0);
    const inn =
      c.id === recordedChannel.id
        ? recordedPolicy(recordedChannel.node_one.policy as Policy)
        : policy(
            r,
            inRates.pop() ?? 0,
            r.pick([0, 1000, 1000, 500]),
            r.pick([40, 80, 144, 34]),
            c.capacity,
            1000,
            0,
          );
    const ch = channel(r, c.id, c.capacity, peer, out, discount(inn));
    if (c.id === recordedChannel.id && recordedChannel.node_two.policy) {
      ch.out = recordedPolicy(recordedChannel.node_two.policy);
      ch.last_update = recordedChannel.last_update ?? ch.last_update;
    }
    channels.push(ch);
  }
  // The rest: sizes spread as a lognormal around 2 M sats, scaled so the total is the recorded one.
  const ceiling = Math.min(...real.map((c) => c.capacity));
  const n = acinq.channels.open - real.length;
  const raw = Array.from({ length: n }, () =>
    Math.min(ceiling * 0.9, Math.exp(Math.log(2_400_000) + r.normal() * 1.25)),
  );
  const target = acinq.capacity - real.reduce((s, c) => s + c.capacity, 0);
  const scale = target / raw.reduce((s, x) => s + x, 0);
  const sizes = raw.map((x) => Math.max(20_000, Math.round((x * scale) / 10_000) * 10_000));
  // The splice's new channel and the shared one have set sizes; the rounding goes to a third.
  sizes[0] = 3_500_000;
  sizes[1] = 2_000_000;
  sizes[2] = (sizes[2] ?? 0) + target - sizes.reduce((s, x) => s + x, 0);
  const others = rankings.filter((x) => x.id !== acinq.id);
  const ids = new Set(channels.map((c) => c.id));
  for (let k = 0; k < n; k++) {
    let h = height(r);
    let id = `${h}x${r.int(1, 3900)}x${r.int(0, 2)}`;
    if (k === 0) id = SPLICED_INTO;
    if (k === 1) id = SHARED;
    while (ids.has(id)) {
      h = height(r);
      id = `${h}x${r.int(1, 3900)}x${r.int(0, 2)}`;
    }
    ids.add(id);
    const cap = sizes[k] ?? 1_000_000;
    const peer =
      k === 1 ? smallPeer() : r.next() < 0.22 ? rankedPeer(r.pick(others)) : invent(r, k);
    const out = policy(r, outRates[k] ?? 900, 1000, 144, cap, minHtlc, 0.012);
    const inn = policy(
      r,
      inRates[k] ?? null,
      r.pick([0, 1000, 1000, 500, 1]),
      r.pick([40, 80, 144, 34, 18]),
      cap,
      1000,
      0.02,
    );
    channels.push(channel(r, id, cap, peer, out, discount(inn)));
  }
  channels.sort((a, b) => b.capacity - a.capacity || a.height - b.height);
  const closed = closes(r, 74, others, acinq.id);
  // The splice's new channel is with the same peer as the channel it continues.
  const spliced = closed.find((c) => c.id === SPLICED);
  const into = channels.find((c) => c.id === SPLICED_INTO);
  if (spliced && into) into.peer = spliced.peer;
  acinqSample = {
    id: acinq.id,
    alias: acinq.alias,
    color: (acinqJson as { color?: string }).color ?? null,
    socket: acinq.addresses?.[0] ?? null,
    addresses: acinq.addresses ?? [],
    rank: { capacity: 3, channels: 1 },
    last_update: acinq.last_update ?? MOCK_NOW,
    first_seen: acinq.first_seen ?? MOCK_NOW,
    channels,
    closed,
    history: past(r, channels, 11, 0.026),
    features: acinq.features,
  };
  return acinqSample;
}

/** Closes over the last 90 days, mostly cooperative, as mainnet's are. */
function closes(r: Rng, n: number, peers: RankedNode[], self: string): ClosedChannel[] {
  const out: ClosedChannel[] = [];
  for (let k = 0; k < n; k++) {
    const kind: CloseKind =
      k === 0 ? "cooperative" : k % 11 === 4 ? "force" : k % 17 === 9 ? "other" : "cooperative";
    const closedHeight = TIP - r.int(3, 12_900);
    const h = Math.min(closedHeight - 200, height(r));
    const capacity = Math.round(Math.exp(Math.log(3_000_000) + r.normal()) / 10_000) * 10_000;
    const peer =
      r.next() < 0.3 ? rankedPeer(r.pick(peers.filter((p) => p.id !== self))) : invent(r, k + 5000);
    out.push({
      id: k === 0 ? SPLICED : `${h}x${r.int(1, 3900)}x${r.int(0, 2)}`,
      peer,
      capacity: k === 0 ? 4_000_000 : capacity,
      kind,
      continued: k === 0 ? SPLICED_INTO : null,
      fee: kind === "force" ? r.int(420, 3100) : r.int(141, 620),
      opened: blockTime(k === 0 ? 948_730 : h),
      closedHeight: k === 0 ? 975_402 : closedHeight,
      closedTime: blockTime(k === 0 ? 975_402 : closedHeight),
      txid: txid(r),
    });
  }
  return sorted(out, (a, b) => b.closedHeight - a.closedHeight);
}

/** A node's channels and capacity at each midnight for 90 days, ending at its totals now: the
 *  last week's gain exact, and before it a drift in proportion to the node's size. */
function past(
  r: Rng,
  channels: OpenChannel[],
  weekGain: number,
  weekGrowth: number,
): HistoryPoint[] {
  const now = { channels: channels.length, capacity: channels.reduce((s, c) => s + c.capacity, 0) };
  const midnight = Math.floor(MOCK_NOW / DAY) * DAY;
  const points: HistoryPoint[] = [];
  let ch = now.channels;
  let cap = now.capacity;
  const drift = Math.sqrt(now.channels) * 0.15;
  for (let d = 0; d <= 90; d++) {
    points.push({ time: midnight - d * DAY, channels: ch, capacity: cap });
    if (d < 7) {
      ch -= Math.floor((weekGain * (d + 1)) / 7) - Math.floor((weekGain * d) / 7);
      cap = Math.round(cap / (1 + weekGrowth / 7));
    } else {
      const step = Math.round(r.normal() * drift + drift * 0.3);
      ch = Math.max(1, ch - step);
      cap = Math.max(100_000, Math.round(cap * (1 - (step / Math.max(ch, 1)) * 0.8)));
    }
  }
  points.reverse();
  points.push({ time: MOCK_NOW, ...now });
  return points;
}

function smallNode(): SampleNode {
  if (smallSample) return smallSample;
  const r = rng(7);
  const big = largeNode();
  const pick = (alias: string) => {
    const n = rankings.find((x) => x.alias === alias);
    return n && rankedPeer(n);
  };
  const peers: Peer[] = [
    pick("ACINQ") ?? invent(r, 0),
    pick("Kraken 🐙⚡") ?? invent(r, 0),
    invent(r, 1),
    pick("Megalithic.me") ?? invent(r, 0),
    invent(r, 2),
    invent(r, 3),
    invent(r, 13),
  ];
  const sizes = [2_000_000, 3_000_000, 1_500_000, 2_500_000, 1_000_000, 750_000, 2_500_000];
  const ids = [
    SHARED,
    "966815x1207x0",
    "969402x388x1",
    "971120x2716x0",
    "973998x45x1",
    "975211x1904x0",
    "975530x617x1",
  ];
  const shared = big.channels.find((c) => c.id === SHARED);
  const channels = ids.map((id, k) => {
    const cap = sizes[k] ?? 1_000_000;
    // Its own fee on the shared channel is ACINQ's incoming one, and the other way round.
    const out =
      k === 0 && shared
        ? shared.in
        : policy(r, [120, 250, 50, 180, 0, 100, 300][k] ?? 100, 0, 80, cap, 1000, 0);
    const inn =
      k === 0 && shared
        ? shared.out
        : policy(
            r,
            r.pick([1, 10, 250, 900, 2499, 50]),
            r.pick([0, 1000]),
            r.pick([40, 80, 144]),
            cap,
            1000,
            0,
          );
    if (k === 4 && inn) inn.enabled = false;
    if (k === 6 && out) out.enabled = false;
    // It runs lnd and gives Kraken's traffic a discount coming in.
    if (k === 1 && out) {
      out.inbound_rate = -50;
      out.inbound_base_msat = 0;
    }
    return channel(r, id, cap, peers[k] ?? invent(r, k), out, inn);
  });
  channels.sort((a, b) => b.capacity - a.capacity || a.height - b.height);
  const closed: ClosedChannel[] = [
    {
      id: BREACHED,
      peer: {
        id: "0377a2c5e9d1b04f8e6c3a7d2915b0e48f6a1c3d5e7f9b2a4c6d8e0f1a3b5c7d9e",
        alias: "cheapskate-node",
        channels: 3,
        capacity: 2_100_000,
      },
      capacity: 1_200_000,
      kind: "penalty",
      continued: null,
      fee: 1_830,
      opened: blockTime(958_844),
      closedHeight: 974_016,
      closedTime: blockTime(974_016),
      txid: "6f1c0b9e2a4d87f35c1e9a0b6d2f48c7e3a95b1d0c6f2e84a7b39d5c1e0f6a28",
    },
    {
      id: "962205x2290x0",
      peer: invent(r, 40),
      capacity: 1_000_000,
      kind: "cooperative",
      continued: null,
      fee: 212,
      opened: blockTime(962_205),
      closedHeight: 970_877,
      closedTime: blockTime(970_877),
      txid: txid(r),
    },
  ];
  smallSample = {
    id: SMALL_KEY,
    alias: "pinecone-relay",
    color: "#f2a900",
    socket: "pinecnq5hkx4dbw7o2l3yqzr6iuvjwzq6s3amcyk2hb7mxp4gw7yzqd.onion:9735",
    addresses: ["pinecnq5hkx4dbw7o2l3yqzr6iuvjwzq6s3amcyk2hb7mxp4gw7yzqd.onion:9735"],
    rank: { capacity: 4812, channels: 3950 },
    last_update: MOCK_NOW - 5 * 3600 - 620,
    first_seen: blockTime(958_844),
    channels,
    closed,
    history: past(r, channels, 1, 0.12),
    // An lnd node's usual bits, as the recorded small node announces them.
    features: [
      [0, "data-loss-protect", true],
      [5, "upfront-shutdown-script", false],
      [7, "gossip-queries", false],
      [8, "tlv-onion", true],
      [12, "static-remote-key", true],
      [14, "payment-addr", true],
      [17, "multi-path-payments", false],
      [19, "wumbo-channels", false],
      [23, "anchors-zero-fee-htlc-tx", false],
      [27, "shutdown-any-segwit", false],
      [35, "quiesce", false],
      [39, "onion-messages", false],
      [47, "scid-alias", false],
    ].map(([bit, name, required]) => ({
      bit: Number(bit),
      name: String(name),
      required: required === true,
    })),
  };
  return smallSample;
}

/** Recorded channel 811984x2037x0, as the channel page reads it. */
export const recorded = recordedChannel;
