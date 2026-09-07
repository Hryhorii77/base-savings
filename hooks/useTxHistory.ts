import { useSyncExternalStore } from "react";
import { getTxHistory, subscribeTxHistory, type TxRecord } from "@/lib/txHistory";

const EMPTY: TxRecord[] = [];

export function useTxHistory(address: string | undefined): TxRecord[] {
  return useSyncExternalStore(
    subscribeTxHistory,
    () => (address ? getTxHistory(address) : EMPTY),
    () => EMPTY
  );
}
