import type { ProtocolId } from "./protocols/types";

export interface TxRecord {
  hash: string;
  protocol: ProtocolId;
  mode: "deposit" | "withdraw";
  /** USDC base units (6 decimals), stored as a string since JSON can't hold bigint. */
  amount: string;
  timestamp: number;
}

const MAX_RECORDS = 10;

// Fired after every recordTx call so components using useSyncExternalStore
// (hooks/useTxHistory.ts) re-render immediately — the browser's own
// "storage" event only fires in *other* tabs, never the one that wrote it.
const UPDATED_EVENT = "base-savings:tx-history-updated";

function storageKey(address: string): string {
  return `base-savings:tx-history:${address.toLowerCase()}`;
}

const EMPTY: TxRecord[] = [];

// useSyncExternalStore (hooks/useTxHistory.ts) requires getSnapshot to return
// the *same* reference when nothing changed, or it re-renders forever.
// JSON.parse-ing localStorage fresh on every call would return a new array
// each time even when the underlying string is identical — cache the parsed
// result per key and only re-parse when the raw string actually changes.
const parsedCache = new Map<string, { raw: string; records: TxRecord[] }>();

export function getTxHistory(address: string): TxRecord[] {
  if (typeof localStorage === "undefined") return EMPTY;
  const key = storageKey(address);
  const raw = localStorage.getItem(key);
  if (!raw) return EMPTY;

  const cached = parsedCache.get(key);
  if (cached && cached.raw === raw) return cached.records;

  let records: TxRecord[];
  try {
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    records = EMPTY;
  }
  parsedCache.set(key, { raw, records });
  return records;
}

export function recordTx(address: string, record: TxRecord): void {
  if (typeof localStorage === "undefined") return;
  const updated = [record, ...getTxHistory(address)].slice(0, MAX_RECORDS);
  localStorage.setItem(storageKey(address), JSON.stringify(updated));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(UPDATED_EVENT));
  }
}

export function subscribeTxHistory(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(UPDATED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(UPDATED_EVENT, callback);
  };
}
