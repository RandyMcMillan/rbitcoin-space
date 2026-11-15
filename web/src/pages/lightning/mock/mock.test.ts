import { describe, expect, it } from "vitest";
import { parseSats } from "./ChannelPage";
import { msatAsSats } from "./parts";
import { mix, squarify } from "./treemap";

describe("the mockups' pure parts", () => {
  it("reads an amount as typed, and never reinterprets a bad one", () => {
    expect(parseSats("100 000")).toStrictEqual({ sats: 100_000 });
    expect(parseSats("100 000")).toStrictEqual({ sats: 100_000 });
    expect(parseSats("-1")).toHaveProperty("error");
    expect(parseSats("−1")).toHaveProperty("error");
    expect(parseSats("abc")).toHaveProperty("error");
    expect(parseSats("1.5")).toHaveProperty("error");
    expect(parseSats("0")).toHaveProperty("error");
    expect(parseSats("")).toHaveProperty("error");
  });

  it("writes millisatoshis as sats, singular for one", () => {
    expect(msatAsSats(1000)).toBe("1 sat");
    expect(msatAsSats(500)).toBe("0.5 sats");
    expect(msatAsSats(-1000)).toBe("−1 sat");
    expect(msatAsSats(20_000_000_000)).toBe("20 000 000 sats");
  });

  it("mixes colours written short or long", () => {
    expect(mix("#000000", "#fff", 0.5)).toBe("#808080");
    expect(mix("#0f766e", "#ffffff", 1)).toBe("#0f766e");
  });

  it("lays out areas in proportion, inside the box", () => {
    const cells = squarify([6, 6, 4, 3, 2, 2, 1], 600, 400);
    const total = 24;
    cells.forEach((c, i) => {
      expect(c.x).toBeGreaterThanOrEqual(-1e-9);
      expect(c.y).toBeGreaterThanOrEqual(-1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(c.y + c.h).toBeLessThanOrEqual(400 + 1e-6);
      expect(c.w * c.h).toBeCloseTo((([6, 6, 4, 3, 2, 2, 1][i] ?? 0) / total) * 600 * 400, 6);
    });
  });
});
