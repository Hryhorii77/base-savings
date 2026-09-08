import type { Address } from "viem";
import type { Config } from "wagmi";
import { getCapabilities, sendCalls, waitForCallsStatus } from "wagmi/actions";
import { toSendCalls } from "./rebalanceCalls";
import type { TxRequest } from "./protocols/types";

export interface BatchResult {
  /** One hash per input tx, in order. */
  hashes: `0x${string}`[];
}

// Some wallets return one receipt per call; others (e.g. a single underlying
// L1 tx covering the whole batch) return fewer than `count`. Falling back to
// the batch id itself for any call missing a receipt still gives a usable
// Basescan link rather than an empty one.
export function extractCallHashes(
  count: number,
  batchId: string,
  receipts?: readonly { transactionHash?: string }[]
): `0x${string}`[] {
  return Array.from(
    { length: count },
    (_, i) => (receipts?.[i]?.transactionHash ?? batchId) as `0x${string}`
  );
}

/**
 * Attempts to sign and send `txs` as one EIP-5792 batch (`wallet_sendCalls`).
 * Returns null if the connected wallet doesn't report atomic-batch support
 * via `wallet_getCapabilities` — most injected wallets today don't implement
 * that RPC method at all, which we treat the same as "unsupported."
 *
 * Once a batch is actually attempted, any further error (including the user
 * rejecting the single batched signature) propagates to the caller instead
 * of triggering a fallback — a rejection must never be silently retried as
 * separate sequential signatures behind the user's back.
 */
export async function trySendCallsBatch(
  config: Config,
  chainId: number,
  account: Address,
  txs: TxRequest[],
  paymasterUrl?: string
): Promise<BatchResult | null> {
  let atomicSupported = false;
  try {
    // Passing chainId returns the capabilities record for that chain
    // directly (not keyed by chain), per wagmi/viem's getCapabilities contract.
    const caps = await getCapabilities(config, { account, chainId });
    const atomicStatus = caps?.atomic?.status;
    atomicSupported = atomicStatus === "supported" || atomicStatus === "ready";
  } catch {
    atomicSupported = false;
  }
  if (!atomicSupported) return null;

  const { id } = await sendCalls(config, {
    account,
    chainId,
    calls: toSendCalls(txs),
    // `optional: true` lets a wallet that doesn't actually support paymaster
    // sponsorship ignore the hint rather than reject the whole batch over it.
    // Real enforcement of any spending policy (first-deposit-only, per-address
    // caps, etc.) lives server-side in the paymaster provider's own dashboard
    // — this app only ever *requests* sponsorship, never decides it.
    ...(paymasterUrl ? { capabilities: { paymasterService: { url: paymasterUrl, optional: true } } } : {}),
  });
  const result = await waitForCallsStatus(config, { id, throwOnFailure: true });

  return { hashes: extractCallHashes(txs.length, id, result.receipts) };
}
