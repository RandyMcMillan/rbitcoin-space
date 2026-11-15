// A node's fee rates in the histogram's rows, built from its channels, and the figures that
// summarise them. The rows are the ones lightning.ts draws (FEE_ROWS there, not exported: the
// mockups do not change the shipped Lightning code).
import { sorted } from "../../../components/chart/geometry";
import { groupDigits } from "../../../lib/format";
import type { FeeRow } from "../lightning";
import type { OpenChannel } from "./sample";

export const FEE_ROWS = [0, 1, 10, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000] as const;

export type Way = "out" | "in";

/** The row index a rate falls in. */
export const rowOf = (rate: number): number => FEE_ROWS.filter((from) => rate >= from).length - 1;

export function rowLabel(k: number): string {
  const from = FEE_ROWS[k] ?? 0;
  const next = FEE_ROWS[k + 1];
  if (next === undefined) return `${groupDigits(from)}+`;
  return next - 1 === from ? groupDigits(from) : `${groupDigits(from)}–${groupDigits(next - 1)}`;
}

const rate = (c: OpenChannel, way: Way) => (way === "out" ? c.out : c.in)?.fee_rate ?? null;

/** Whether a channel's rate one way is in the row starting at `from` (null: no policy). */
export function inRow(c: OpenChannel, way: Way, from: number | null): boolean {
  const r = rate(c, way);
  if (from === null) return r === null;
  return r !== null && FEE_ROWS[rowOf(r)] === from;
}

/** The histogram's rows, cheapest first, from the cheapest held to the dearest, then "No policy". */
export function feeRowsOf(channels: readonly OpenChannel[]): FeeRow[] {
  const rows: FeeRow[] = [...FEE_ROWS.keys(), -1].map((k) => ({
    label: k < 0 ? "No policy" : rowLabel(k),
    from: k < 0 ? null : (FEE_ROWS[k] ?? 0),
    outgoing: { count: 0, capacity: 0 },
    incoming: { count: 0, capacity: 0 },
  }));
  for (const c of channels) {
    for (const [way, key] of [
      ["out", "outgoing"],
      ["in", "incoming"],
    ] as const) {
      const r = rate(c, way);
      const row = rows.at(r === null ? -1 : rowOf(r));
      if (!row) continue;
      row[key].count += 1;
      row[key].capacity += c.capacity;
    }
  }
  const held = (r: FeeRow) => r.outgoing.count + r.incoming.count > 0;
  const priced = rows.slice(0, -1);
  const kept = priced.flatMap((r, i) => (held(r) ? [i] : []));
  const none = rows.at(-1);
  return [
    ...priced.slice(kept[0] ?? 0, (kept.at(-1) ?? -1) + 1),
    ...(none && held(none) ? [none] : []),
  ];
}

export interface FeeSummary {
  median: number;
  weighted: number;
  lowest: number;
  highest: number;
  count: number;
}

/** Median, capacity-weighted average, lowest and highest rate one way, over channels with a policy. */
export function summary(channels: readonly OpenChannel[], way: Way): FeeSummary | null {
  const xs = channels.flatMap((c) => {
    const r = rate(c, way);
    return r === null ? [] : [{ r, cap: c.capacity }];
  });
  if (xs.length === 0) return null;
  const rates = sorted(
    xs.map((x) => x.r),
    (a, b) => a - b,
  );
  const mid = Math.floor(rates.length / 2);
  const median =
    rates.length % 2 === 1
      ? (rates[mid] ?? 0)
      : Math.round(((rates[mid - 1] ?? 0) + (rates[mid] ?? 0)) / 2);
  // As the network's averages do, rates over 1 000 000 ppm (which refuse to route) are left out.
  const routing = xs.filter((x) => x.r <= 1_000_000);
  const cap = routing.reduce((s, x) => s + x.cap, 0);
  return {
    median,
    weighted: cap === 0 ? 0 : Math.round(routing.reduce((s, x) => s + x.r * x.cap, 0) / cap),
    lowest: rates[0] ?? 0,
    highest: rates.at(-1) ?? 0,
    count: xs.length,
  };
}
