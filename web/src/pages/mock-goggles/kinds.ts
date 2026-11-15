// MOCKUP (GG5), never merged: the goggles' kinds, how a pick matches, and sample blocks.
import type { GridTx } from "../../components/txgrid/layout";

/** A sample transaction: the grid's record and the 64-bit flags field the server will send. */
export interface FlaggedTx extends GridTx {
  /** Bit N is `2 ** N` (docs/API.md, flags). Bits stay under 2⁵³, so a number holds them exactly. */
  flags: number;
}

export type Group = "Common" | "Scripts" | "Other" | "Version and RBF" | "Signature hash";
export const GROUPS: readonly Group[] = [
  "Common",
  "Scripts",
  "Other",
  "Version and RBF",
  "Signature hash",
];

export interface Kind {
  key: string;
  label: string;
  bit: number;
  group: Group;
}

// Bits 16 to 18 (the two CPFP sides, replacement) are GG4's; 16 as "paid by a child" is assumed.
export const KINDS: readonly Kind[] = [
  { key: "taproot", label: "Taproot", bit: 14, group: "Common" },
  { key: "inscription", label: "Inscription", bit: 26, group: "Common" },
  { key: "op-return", label: "OP_RETURN", bit: 24, group: "Common" },
  { key: "consolidation", label: "Consolidation", bit: 33, group: "Common" },
  { key: "paid-by-child", label: "Paid by a child", bit: 16, group: "Common" },
  { key: "p2wpkh", label: "P2WPKH", bit: 12, group: "Scripts" },
  { key: "p2wsh", label: "P2WSH", bit: 13, group: "Scripts" },
  { key: "p2sh", label: "P2SH", bit: 11, group: "Scripts" },
  { key: "p2pkh", label: "P2PKH", bit: 10, group: "Scripts" },
  { key: "p2pk", label: "P2PK", bit: 8, group: "Scripts" },
  { key: "multisig", label: "Bare multisig", bit: 9, group: "Scripts" },
  { key: "pays-parent", label: "Pays for a parent", bit: 17, group: "Other" },
  { key: "replacement", label: "Replacement", bit: 18, group: "Other" },
  { key: "batch", label: "Batch payment", bit: 34, group: "Other" },
  { key: "fake-key", label: "Fake public key", bit: 25, group: "Other" },
  { key: "rbf", label: "Signals RBF", bit: 0, group: "Version and RBF" },
  { key: "no-rbf", label: "No RBF", bit: 1, group: "Version and RBF" },
  { key: "v1", label: "Version 1", bit: 2, group: "Version and RBF" },
  { key: "v2", label: "Version 2", bit: 3, group: "Version and RBF" },
  { key: "v3", label: "Version 3", bit: 4, group: "Version and RBF" },
  { key: "all", label: "All", bit: 40, group: "Signature hash" },
  { key: "none", label: "None", bit: 41, group: "Signature hash" },
  { key: "single", label: "Single", bit: 42, group: "Signature hash" },
  { key: "default", label: "Default", bit: 43, group: "Signature hash" },
  { key: "acp", label: "Anyone can pay", bit: 44, group: "Signature hash" },
];

export const has = (flags: number, bit: number): boolean => Math.floor(flags / 2 ** bit) % 2 === 1;

export type Mode = "any" | "all";

/** Whether a transaction carries any (or all) of the picked kinds. Nothing picked matches nothing. */
export function matches(flags: number, picked: readonly Kind[], mode: Mode): boolean {
  if (picked.length === 0) return false;
  return mode === "any"
    ? picked.some((k) => has(flags, k.bit))
    : picked.every((k) => has(flags, k.bit));
}

/** What a pick lights: how many transactions, and their share of the block's virtual size. */
export function tally(
  txs: readonly FlaggedTx[],
  test: (flags: number) => boolean,
): { count: number; share: number } {
  let count = 0;
  let size = 0;
  let total = 0;
  for (const tx of txs) {
    total += tx.vsize;
    if (test(tx.flags)) {
      count++;
      size += tx.vsize;
    }
  }
  return { count, share: total > 0 ? size / total : 0 };
}

/** A share as the chips print it: `0`, `<0.1%`, one decimal under 10%, whole above, `100%`. */
export function formatShare(share: number): string {
  if (share <= 0) return "0";
  if (share >= 1) return "100%";
  if (share < 0.0005) return "<0.1%";
  if (share < 0.1) return `${(share * 100).toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.min(99, Math.round(share * 100))}%`;
}

// ---- Sample blocks ----

function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export type Sample = "recent" | "inscriptions";

/**
 * A block's worth of made-up transactions with mainnet's lopsided make-up: "recent" a projected
 * block of today (RBF, version 2, P2WPKH, OP_RETURN and SIGHASH_ALL above 99%, Taproot 0.3%),
 * "inscriptions" a mined block of 2023 that is a third inscriptions.
 */
export function sample(kind: Sample): FlaggedTx[] {
  const rnd = random(kind === "recent" ? 975_411 : 790_000);
  const chance = (p: number) => rnd() < p;
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const logBetween = (lo: number, hi: number) => Math.exp(between(Math.log(lo), Math.log(hi)));
  const txs: FlaggedTx[] = [];
  let used = 0;
  const bit = (b: number) => 2 ** b;
  if (kind === "inscriptions") {
    const vsize = 260;
    txs.push({
      id: 0,
      vsize,
      fee: 0,
      coinbase: true,
      value: 638_000_000,
      flags: bit(1) + bit(2) + bit(12) + bit(24),
    });
    used += vsize;
  }
  while (used < 996_000) {
    let flags = 0;
    let vsize: number;
    let rate: number;
    const on = (b: number, p: number) => {
      if (chance(p)) flags += bit(b);
    };
    if (kind === "recent") {
      const r = rnd();
      rate =
        r < 0.45
          ? between(0.1, 0.12)
          : r < 0.67
            ? between(0.12, 0.15)
            : r < 0.77
              ? between(0.15, 0.3)
              : r < 0.87
                ? between(0.3, 1)
                : r < 0.95
                  ? logBetween(1, 5)
                  : logBetween(5, 40);
      const shape = rnd();
      const consolidation = shape < 0.008;
      const batch = !consolidation && shape < 0.02;
      vsize = consolidation
        ? between(350, 4000)
        : batch
          ? between(400, 3000)
          : chance(0.75)
            ? between(110, 145)
            : logBetween(180, 1200);
      if (consolidation) flags += bit(33);
      if (batch) flags += bit(34);
      flags += chance(0.995) ? bit(0) : bit(1);
      const v = rnd();
      flags += v < 0.995 ? bit(3) : v < 0.999 ? bit(2) : bit(4);
      on(12, 0.994);
      on(24, 0.992);
      const taproot = chance(0.003);
      if (taproot) {
        flags += bit(14) + bit(43);
        if (chance(0.67)) {
          flags += bit(26);
          vsize = between(150, 420);
        }
      }
      if (!taproot || chance(0.5)) on(40, 0.996);
      on(11, 0.015);
      on(10, 0.008);
      on(13, 0.006);
      on(8, 0.0002);
      if (chance(0.0005)) flags += bit(9) + (chance(0.6) ? bit(25) : 0);
      on(16, 0.006);
      on(17, 0.005);
      on(18, 0.02);
      on(42, 0.0005);
      on(44, 0.0005);
    } else {
      rate = chance(0.7) ? logBetween(2, 12) : logBetween(12, 60);
      const inscription = chance(0.33);
      if (inscription) {
        vsize = chance(0.94) ? between(150, 420) : logBetween(2000, 60_000);
        flags += bit(14) + bit(26) + bit(43);
        flags += chance(0.9) ? bit(0) : bit(1);
        flags += chance(0.1) ? bit(2) : bit(3);
      } else {
        const shape = rnd();
        const consolidation = shape < 0.015;
        const batch = !consolidation && shape < 0.04;
        vsize = consolidation
          ? between(500, 6000)
          : batch
            ? between(500, 4000)
            : chance(0.6)
              ? between(110, 230)
              : logBetween(200, 1500);
        if (consolidation) flags += bit(33);
        if (batch) flags += bit(34);
        flags += chance(0.45) ? bit(0) : bit(1);
        flags += chance(0.25) ? bit(2) : bit(3);
        const taproot = chance(0.12);
        if (taproot) flags += bit(14) + bit(43);
        if (!taproot || chance(0.4)) on(40, 0.97);
        on(12, 0.6);
        on(10, 0.12);
        on(11, 0.2);
        on(13, 0.08);
        on(24, 0.06);
        on(8, 0.001);
        if (chance(0.002)) flags += bit(9) + (chance(0.6) ? bit(25) : 0);
        on(16, 0.012);
        on(17, 0.01);
        on(18, 0.01);
        on(42, 0.003);
        on(44, 0.005);
      }
    }
    vsize = Math.round(vsize);
    used += vsize;
    txs.push({
      id: txs.length,
      vsize,
      fee: Math.round(vsize * rate),
      value: Math.round(logBetween(5_000, 2_000_000_000)),
      flags,
    });
  }
  return txs;
}

/** A made-up txid for the tooltip. */
export function fakeTxid(id: number | string): string {
  const rnd = random(Number(id) * 7919 + 13);
  return Array.from({ length: 64 }, () => Math.floor(rnd() * 16).toString(16)).join("");
}
