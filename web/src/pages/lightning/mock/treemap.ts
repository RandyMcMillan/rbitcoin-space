// The node map's layout and colourings: a squarified treemap (rows of cells laid along the
// shorter side, each row kept as close to square as it can), and the scales that colour a cell.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lays out `values` (largest first, all above zero) in a `w` by `h` box, each cell's area in
 * proportion to its value. Returns the cells in the order given.
 */
export function squarify(values: readonly number[], w: number, h: number): Rect[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0 || w <= 0 || h <= 0) return values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const areas = values.map((v) => (v / total) * w * h);
  const out: Rect[] = [];
  let free = { x: 0, y: 0, w, h };
  // The worst aspect ratio in a row of `sum` total, `max` and `min` largest and smallest, on `side`.
  const worst = (sum: number, max: number, min: number, side: number) =>
    Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  let start = 0;
  while (start < areas.length) {
    const side = Math.min(free.w, free.h);
    let end = start + 1;
    let sum = areas[start] ?? 0;
    // Grow the row while adding the next cell does not make its worst cell worse.
    while (end < areas.length) {
      const next = areas[end] ?? 0;
      const before = worst(sum, areas[start] ?? 0, areas[end - 1] ?? 0, side);
      const after = worst(sum + next, areas[start] ?? 0, next, side);
      if (after > before) break;
      sum += next;
      end++;
    }
    // The row runs along the shorter side: a column at the left of a wide box, a row along the top
    // of a tall one.
    const thick = side > 0 ? sum / side : 0;
    let along = 0;
    for (let k = start; k < end; k++) {
      const len = thick > 0 ? (areas[k] ?? 0) / thick : 0;
      out.push(
        free.w >= free.h
          ? { x: free.x, y: free.y + along, w: thick, h: len }
          : { x: free.x + along, y: free.y, w: len, h: thick },
      );
      along += len;
    }
    free =
      free.w >= free.h
        ? { x: free.x + thick, y: free.y, w: free.w - thick, h: free.h }
        : { x: free.x, y: free.y + thick, w: free.w, h: free.h - thick };
    start = end;
  }
  return out;
}

/** Ppm bands for the fee colourings, one per fee-ramp token, quiet to strong. */
export const PPM_BANDS = [0, 1, 10, 50, 100, 200, 300, 500, 800, 1_000, 2_000, 5_000] as const;

export const ppmBand = (ppm: number): number => PPM_BANDS.filter((b) => ppm >= b).length - 1;

/** Age bands, youngest first; the strongest colour is the oldest channel. */
export const AGE_BANDS = [
  { upTo: 30, label: "Under 1 month" },
  { upTo: 182, label: "1 to 6 months" },
  { upTo: 365, label: "6 to 12 months" },
  { upTo: 730, label: "1 to 2 years" },
  { upTo: Infinity, label: "2 years or more" },
] as const;

export const ageBand = (days: number): number => AGE_BANDS.findIndex((b) => days < b.upTo);

/** Mixes two `#rrggbb` colours in sRGB: `t` of `a`, the rest `b`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v * t + (pb[i] ?? 0) * (1 - t)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parse(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [
    Number.parseInt(m[1] ?? "0", 16),
    Number.parseInt(m[2] ?? "0", 16),
    Number.parseInt(m[3] ?? "0", 16),
  ];
}

/** How much of the text colour is mixed into the age colour (the ochre series) per band: the
 *  youngest is the ochre itself, which holds 3:1 on a panel; older ones step towards the text. */
export const AGE_MIX = [0, 0.12, 0.24, 0.36, 0.48] as const;
