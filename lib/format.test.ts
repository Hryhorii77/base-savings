import { describe, expect, it } from "vitest";
import { formatBps, formatUsdc, isValidTxHash, parseUsdc } from "./format";

describe("formatUsdc", () => {
  it("formats zero", () => {
    expect(formatUsdc(0n)).toBe("$0.00");
  });

  it("formats whole dollar amounts", () => {
    expect(formatUsdc(1_000_000n)).toBe("$1.00");
  });

  it("truncates (does not round) fractional cents", () => {
    // 1.234567 USDC — the 3rd decimal onward should be dropped, not rounded up
    expect(formatUsdc(1_234_567n)).toBe("$1.23");
  });

  it("adds thousands separators", () => {
    expect(formatUsdc(1_000_000_000n)).toBe("$1,000.00");
  });
});

describe("parseUsdc", () => {
  it("parses a whole number", () => {
    expect(parseUsdc("10")).toBe(10_000_000n);
  });

  it("parses a decimal amount", () => {
    expect(parseUsdc("1.5")).toBe(1_500_000n);
  });

  it("parses a decimal with fewer than 6 fraction digits", () => {
    expect(parseUsdc("0.1")).toBe(100_000n);
  });

  it("truncates extra fraction digits beyond USDC's 6 decimals", () => {
    expect(parseUsdc("1.1234567")).toBe(1_123_456n);
  });

  it("returns 0 for empty input", () => {
    expect(parseUsdc("")).toBe(0n);
  });

  it("returns 0 for non-numeric input", () => {
    expect(parseUsdc("abc")).toBe(0n);
  });

  it("round-trips through formatUsdc", () => {
    const amount = parseUsdc("42.50");
    expect(formatUsdc(amount)).toBe("$42.50");
  });
});

describe("formatBps", () => {
  it("formats basis points as a percentage", () => {
    expect(formatBps(425)).toBe("4.25%");
  });

  it("formats zero", () => {
    expect(formatBps(0)).toBe("0.00%");
  });

  it("formats sub-1% values", () => {
    expect(formatBps(25)).toBe("0.25%");
  });
});

describe("isValidTxHash", () => {
  it("accepts a real 32-byte transaction hash", () => {
    expect(isValidTxHash("0x" + "a".repeat(64))).toBe(true);
  });

  it("rejects an EIP-5792 batch id shaped like a hash+chainId concatenation", () => {
    // Observed live: Coinbase Smart Wallet's wallet_sendCalls returned an id
    // of this exact shape (64 hex chars + a 64-hex-char padded chainId) when
    // it didn't populate per-call receipts — 128 hex chars, not 64.
    expect(isValidTxHash("0x" + "b".repeat(64) + "0".repeat(60) + "2105")).toBe(false);
  });

  it("rejects a batch id shorter than a real hash", () => {
    expect(isValidTxHash("0xdeadbeef")).toBe(false);
  });

  it("rejects a hash missing the 0x prefix", () => {
    expect(isValidTxHash("a".repeat(64))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidTxHash("0x" + "g".repeat(64))).toBe(false);
  });
});
