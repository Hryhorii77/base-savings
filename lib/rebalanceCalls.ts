import type { Address } from "viem";
import type { TxRequest } from "./protocols/types";

// Shape wagmi's sendCalls (EIP-5792 wallet_sendCalls) expects per call: a
// contract-style call needs `to` (not `address`) alongside abi/functionName/args
// — the wallet encodes `data` itself from those.
export interface SendCallsCall {
  to: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

export function toSendCalls(txs: readonly TxRequest[]): SendCallsCall[] {
  return txs.map((tx) => ({
    to: tx.address,
    abi: tx.abi,
    functionName: tx.functionName,
    args: tx.args,
  }));
}
