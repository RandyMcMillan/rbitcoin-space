import { describe, expect, it } from "vitest";
import { formatShare, KINDS, matches, sample, tally } from "./kinds";

const kind = (key: string) => KINDS.filter((k) => k.key === key);

describe("goggles mock", () => {
  it("matches any or all of the picked kinds, and nothing when none are picked", () => {
    const flags = 2 ** 14 + 2 ** 33;
    const both = [...kind("taproot"), ...kind("inscription")];
    expect(matches(flags, both, "any")).toBe(true);
    expect(matches(flags, both, "all")).toBe(false);
    expect(matches(flags, [], "any")).toBe(false);
  });

  it("prints shares", () => {
    expect([0, 0.0002, 0.003, 0.074, 0.996, 1].map((s) => formatShare(s))).toStrictEqual([
      "0",
      "<0.1%",
      "0.3%",
      "7.4%",
      "99%",
      "100%",
    ]);
  });

  it("makes lopsided samples", () => {
    const recent = sample("recent");
    const share = (key: string) =>
      tally(recent, (f) => matches(f, kind(key), "any")).count / recent.length;
    expect(recent.length).toBeGreaterThan(3000);
    expect(share("rbf")).toBeGreaterThan(0.98);
    expect(share("taproot")).toBeLessThan(0.01);
    const old = sample("inscriptions");
    const inscriptions = tally(old, (f) => matches(f, kind("inscription"), "any")).count;
    expect(inscriptions / old.length).toBeGreaterThan(0.25);
  });
});
