import { beforeEach, describe, expect, it } from "vitest";
import { getTxHistory, recordTx } from "./txHistory";

// vitest.config.ts runs in the "node" environment, which has no
// localStorage/window globals — provide a minimal in-memory stand-in so
// txHistory's `typeof localStorage === "undefined"` guards resolve to real
// storage instead of the no-op path.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  // recordTx dispatches a DOM event via `window` — stub just enough of it
  // (this "node" test environment has no window/DOM at all).
  (globalThis as { window?: unknown }).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
});

const ADDRESS = "0xAbC0000000000000000000000000000000dEf0";

function tx(overrides: Partial<Parameters<typeof recordTx>[1]> = {}) {
  return {
    hash: "0xhash",
    protocol: "morpho" as const,
    mode: "deposit" as const,
    amount: "1000000",
    timestamp: 1,
    ...overrides,
  };
}

describe("txHistory", () => {
  it("returns an empty list for an address with no history", () => {
    expect(getTxHistory(ADDRESS)).toEqual([]);
  });

  it("records a transaction and reads it back", () => {
    recordTx(ADDRESS, tx());
    expect(getTxHistory(ADDRESS)).toEqual([tx()]);
  });

  it("prepends newer transactions (most recent first)", () => {
    recordTx(ADDRESS, tx({ hash: "0x1", timestamp: 1 }));
    recordTx(ADDRESS, tx({ hash: "0x2", timestamp: 2 }));
    const history = getTxHistory(ADDRESS);
    expect(history.map((r) => r.hash)).toEqual(["0x2", "0x1"]);
  });

  it("caps history at 10 records", () => {
    for (let i = 0; i < 15; i++) {
      recordTx(ADDRESS, tx({ hash: `0x${i}`, timestamp: i }));
    }
    expect(getTxHistory(ADDRESS)).toHaveLength(10);
    expect(getTxHistory(ADDRESS)[0].hash).toBe("0x14");
  });

  it("keeps histories separate per address", () => {
    recordTx(ADDRESS, tx({ hash: "0xmine" }));
    recordTx("0x0000000000000000000000000000000000dead", tx({ hash: "0xtheirs" }));
    expect(getTxHistory(ADDRESS)).toHaveLength(1);
    expect(getTxHistory(ADDRESS)[0].hash).toBe("0xmine");
  });

  it("is case-insensitive on address", () => {
    recordTx(ADDRESS, tx());
    expect(getTxHistory(ADDRESS.toLowerCase())).toHaveLength(1);
    expect(getTxHistory(ADDRESS.toUpperCase())).toHaveLength(1);
  });

  // useTxHistory (hooks/useTxHistory.ts) feeds this straight into
  // useSyncExternalStore, which requires getSnapshot to return the same
  // reference when nothing changed or React re-renders forever ("The result
  // of getSnapshot should be cached to avoid an infinite loop").
  it("returns a referentially stable array when nothing changed", () => {
    expect(getTxHistory(ADDRESS)).toBe(getTxHistory(ADDRESS));

    recordTx(ADDRESS, tx());
    const first = getTxHistory(ADDRESS);
    const second = getTxHistory(ADDRESS);
    expect(first).toBe(second);
  });

  it("returns a new array reference only after a write", () => {
    recordTx(ADDRESS, tx({ hash: "0x1" }));
    const before = getTxHistory(ADDRESS);
    recordTx(ADDRESS, tx({ hash: "0x2" }));
    const after = getTxHistory(ADDRESS);
    expect(after).not.toBe(before);
  });
});
