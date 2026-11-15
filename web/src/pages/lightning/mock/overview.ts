// Sample data for the overview mockup: the recorded totals with invented changes per period, a
// series to draw, movers, closes per day, penalties and the live feed's canned events.
import type { CloseKind, Stats } from "../lightning";
import { blockTime, MOCK_NOW, rankings, recordedOverview, rng, TIP } from "./sample";

export const PERIODS = [
  { id: "24h", label: "24 h", words: "the last 24 hours", days: 1 },
  { id: "1w", label: "1 w", words: "the last week", days: 7 },
  { id: "1m", label: "1 m", words: "the last month", days: 30 },
] as const;
export type Period = (typeof PERIODS)[number];

export const now = recordedOverview.statistics;

type Totals = Pick<Stats, "channels" | "nodes" | "capacity" | "med_fee_rate" | "med_base_fee_msat">;

/** Each total at the start of the period: invented changes around the recorded figures. */
export const BEFORE: Record<Period["id"], Totals> = {
  "24h": {
    channels: now.channels - 38,
    nodes: now.nodes - 12,
    capacity: now.capacity - 410_000_000,
    med_fee_rate: now.med_fee_rate,
    med_base_fee_msat: now.med_base_fee_msat,
  },
  "1w": {
    channels: now.channels - 214,
    nodes: now.nodes - 55,
    capacity: now.capacity - 3_160_000_000,
    med_fee_rate: now.med_fee_rate - 2,
    med_base_fee_msat: now.med_base_fee_msat + 16,
  },
  "1m": {
    channels: now.channels + 310,
    nodes: now.nodes - 120,
    capacity: now.capacity + 4_200_000_000,
    med_fee_rate: now.med_fee_rate - 10,
    med_base_fee_msat: now.med_base_fee_msat - 16,
  },
};

export interface Point {
  time: number;
  channels: number;
  capacity: number;
  nodes: number;
  med_fee_rate: number;
}

/** The network's totals across a period, a random walk from its start to now. */
export function series(p: Period): { step: number; points: Point[] } {
  const r = rng(p.days * 31);
  const step = p.days === 1 ? 600 : p.days === 7 ? 3600 : 4 * 3600;
  const n = Math.round((p.days * 86_400) / step);
  const from = BEFORE[p.id];
  const end = Math.floor(now.time / step) * step;
  const points: Point[] = [];
  let wobble = 0;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    wobble = wobble * 0.9 + r.normal() * 0.012;
    const share = Math.min(1, Math.max(0, t + (k === n || k === 0 ? 0 : wobble)));
    const at = (a: number, b: number) => a + (b - a) * share;
    points.push({
      time: end - (n - k) * step,
      channels: Math.round(at(from.channels, now.channels)),
      capacity: Math.round(at(from.capacity, now.capacity)),
      nodes: Math.round(at(from.nodes, now.nodes)),
      med_fee_rate: Math.round(at(from.med_fee_rate, now.med_fee_rate)),
    });
  }
  return { step, points };
}

export interface Mover {
  id: string;
  alias: string | null;
  change: number;
  now: number;
}

/** Movers for a period: the most capacity and channels gained and lost. Invented around real nodes. */
export function movers(p: Period) {
  const r = rng(p.days * 7 + 3);
  const scale = Math.sqrt(p.days);
  const pick = (k: number) => rankings[(k * 7 + p.days) % rankings.length] ?? rankings[0];
  const list = (sign: 1 | -1, key: "capacity" | "channels", base: number): Mover[] =>
    Array.from({ length: 5 }, (_, k) => {
      const n = pick(k * (sign > 0 ? 3 : 5) + (key === "capacity" ? 1 : 2));
      const change = Math.round(base * scale * (1 - k * 0.17) * (0.8 + r.next() * 0.4));
      return {
        id: n?.id ?? "",
        alias: n?.alias ?? null,
        change: sign * (key === "capacity" ? Math.round(change / 1e6) * 1e6 : Math.max(1, change)),
        now: n ? n[key] : 0,
      };
    });
  return {
    capacityUp: list(1, "capacity", 1_600_000_000),
    capacityDown: list(-1, "capacity", 900_000_000),
    channelsUp: list(1, "channels", 14),
    channelsDown: list(-1, "channels", 9),
  };
}

const NEW_NAMES = ["harbor-ln", "lumen⚡relay", "quarry_lnd", "copper-node2", "fjord routing"];
const GONE_NAMES = ["old-tundra", "zephyr-cln", "satoshi hub7", "maple_lnd", "<script>x</script>"];

export function arrivals(p: Period) {
  const r = rng(p.days + 99);
  const span = p.days * 86_400;
  return {
    newest: NEW_NAMES.map((alias, k) => ({
      id: `0${k % 2 === 0 ? "2" : "3"}${r.hex(64)}`,
      alias,
      time: MOCK_NOW - Math.round((span * (k + 0.3)) / 6),
      channels: r.int(1, 6),
      capacity: r.int(5, 120) * 100_000,
    })),
    gone: GONE_NAMES.map((alias, k) => ({
      id: `0${k % 2 === 0 ? "3" : "2"}${r.hex(64)}`,
      alias,
      time: MOCK_NOW - Math.round((span * (k + 0.5)) / 6),
      channels: r.int(1, 9),
      capacity: r.int(5, 300) * 100_000,
    })),
  };
}

export interface DayCloses {
  day: number;
  cooperative: number;
  force: number;
  penalty: number;
  other: number;
}

/** Closes seen per UTC day for the last 30 days: mostly cooperative, as mainnet's are. */
export function closesPerDay(): DayCloses[] {
  const r = rng(30);
  const today = Math.floor(MOCK_NOW / 86_400) * 86_400;
  return Array.from({ length: 30 }, (_, k) => ({
    day: today - (29 - k) * 86_400,
    cooperative: r.int(190, 320),
    force: r.int(6, 24),
    penalty: k === 7 || k === 22 || k === 23 ? 1 : 0,
    other: r.int(1, 8),
  }));
}

export interface Penalty {
  id: string;
  one: { id: string; alias: string | null };
  two: { id: string; alias: string | null };
  capacity: number;
  height: number;
  time: number;
}

export function penalties(): Penalty[] {
  const r = rng(5);
  const heights = [974_019, 972_811, 970_140, 966_302, 961_955, 958_412];
  return heights.map((h, k) => ({
    id: k === 0 ? "958844x904x1" : `${h - r.int(2000, 40_000)}x${r.int(1, 3500)}x${r.int(0, 1)}`,
    one:
      k === 0
        ? {
            id: "02b6e1f4a3c8d905e2174a6f3b9c0d81e5a72f4c6b8d903e1a5f7c2b4d6e8f0a13",
            alias: "pinecone-relay",
          }
        : {
            id: `03${r.hex(64)}`,
            alias:
              ["granite_lnd", "volt-node", "kestrel relay", "orbit⚡", "ember-cln"][k - 1] ?? null,
          },
    two:
      k === 0
        ? {
            id: "0377a2c5e9d1b04f8e6c3a7d2915b0e48f6a1c3d5e7f9b2a4c6d8e0f1a3b5c7d9e",
            alias: "cheapskate-node",
          }
        : {
            id: `02${r.hex(64)}`,
            alias:
              k === 3 ? null : `${["cobalt", "tundra", "maple", "fjord"][k % 4] ?? "x"}-ln${k}`,
          },
    capacity: k === 0 ? 1_200_000 : r.int(2, 60) * 100_000,
    height: h,
    time: blockTime(h),
  }));
}

export type FeedKind = "opened" | CloseKind | "splice";

export interface FeedEvent {
  kind: FeedKind;
  id: string;
  capacity: number;
  one: { id: string; alias: string | null };
  two: { id: string; alias: string | null };
  /** The new channel, for a splice. */
  into?: string;
}

/** The feed's canned events: the recorded newest opens, and invented closes, penalties and splices. */
export function feedEvents(): FeedEvent[] {
  const r = rng(42);
  const opens: FeedEvent[] = recordedOverview.opened.map((c) => ({
    kind: "opened",
    id: c.id,
    capacity: c.capacity,
    one: c.node_one,
    two: c.node_two,
  }));
  const node = () => {
    const n = rankings[r.int(0, rankings.length - 1)];
    return { id: n?.id ?? "", alias: n?.alias ?? null };
  };
  const made: FeedEvent[] = [];
  for (let k = 0; k < 30; k++) {
    const kind: FeedKind =
      k % 13 === 5
        ? "penalty"
        : k % 7 === 3
          ? "splice"
          : k % 5 === 1
            ? "force"
            : k % 3 === 0
              ? "opened"
              : "cooperative";
    const h = TIP - r.int(1000, 90_000);
    made.push({
      kind,
      id: `${h}x${r.int(1, 3800)}x${r.int(0, 2)}`,
      capacity: r.int(1, 80) * 250_000,
      one: node(),
      two: node(),
      ...(kind === "splice" ? { into: `${TIP + 1}x${r.int(1, 3000)}x${r.int(0, 1)}` } : {}),
    });
  }
  // Recorded opens first, then the invented events, interleaved.
  return made.flatMap((e, k) => (opens[k] ? [opens[k], e] : [e]));
}
