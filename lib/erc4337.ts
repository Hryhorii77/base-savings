import { createPublicClient, decodeEventLog, http, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL } from "./config";
import { isValidTxHash } from "./format";

// The canonical ERC-4337 EntryPoint v0.6 deployment — same address on every
// chain that supports it, including Base. Confirmed live against a real
// transaction: Basescan itself labels calls to this address "Entry Point 0.6.0".
export const ENTRY_POINT_V06: Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const userOperationEventAbiItem = {
  type: "event",
  name: "UserOperationEvent",
  inputs: [
    { name: "userOpHash", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "paymaster", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
    { name: "success", type: "bool", indexed: false },
    { name: "actualGasCost", type: "uint256", indexed: false },
    { name: "actualGasUsed", type: "uint256", indexed: false },
  ],
} as const;

const userOperationEventAbi = [userOperationEventAbiItem] as const;

// Same client pattern as every protocol adapter in lib/protocols/*.ts —
// routes through the same-origin proxy (BASE_RPC_URL, see app/api/rpc/route.ts).
const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

// keccak256("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)")
// — computed once via viem's toEventSelector, then hardcoded so matching a
// log's topic0 doesn't need a hash computation on every receipt.
const USER_OPERATION_EVENT_TOPIC: Hex =
  "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f";

export interface MinimalLog {
  address: string;
  topics: readonly Hex[];
  data: Hex;
}

/**
 * A smart-contract-wallet transaction (Coinbase Smart Wallet, Base Account,
 * any ERC-4337 account) routes through the EntryPoint, which deliberately
 * swallows a reverted UserOp's execution failure rather than failing the
 * outer transaction — so `receipt.status` reads 'success' (the bundler still
 * got paid) even when the account's own call reverted and moved zero funds.
 * This is the same signal Basescan itself surfaces as "Error Occurred
 * [execution reverted]": the EntryPoint's own UserOperationEvent log carries
 * a `success` field that plain receipt status can't see.
 *
 * Returns true only when a UserOperationEvent for this exact sender reports
 * success: false — a bundle can carry other unrelated senders' operations,
 * so this doesn't assume the first EntryPoint log found is the caller's own.
 */
export function hasFailedUserOperation(logs: readonly MinimalLog[], sender: Address): boolean {
  for (const log of logs) {
    if (log.address.toLowerCase() !== ENTRY_POINT_V06.toLowerCase()) continue;
    if (log.topics[0] !== USER_OPERATION_EVENT_TOPIC) continue;
    try {
      const decoded = decodeEventLog({
        abi: userOperationEventAbi,
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
      });
      if (decoded.args.sender.toLowerCase() === sender.toLowerCase() && decoded.args.success === false) {
        return true;
      }
    } catch {
      // Same topic0 but a shape decodeEventLog can't parse — not a real
      // UserOperationEvent for this ABI; skip rather than throw.
      continue;
    }
  }
  return false;
}

// Coinbase Smart Wallet's wallet_sendCalls batch id, when wallet_getCallsStatus
// doesn't supply real per-call receipts (the norm in practice — see
// lib/eip5792Batch.ts and https://github.com/base/account-sdk/issues/403),
// is exactly the UserOperation's own userOpHash concatenated with the chain
// id padded to another 32 bytes: 128 hex chars total, not 64. Verified live
// by cross-referencing a real stored batch id against the userOpHash decoded
// from that same operation's on-chain UserOperationEvent — see
// lib/erc4337.test.ts for the exact values.
export function extractUserOpHash(hashOrBatchId: string): Hex | null {
  if (!hashOrBatchId.startsWith("0x")) return null;
  const hex = hashOrBatchId.slice(2);
  if (hex.length !== 128 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return `0x${hex.slice(0, 64)}` as Hex;
}

// How far back to search for the UserOperationEvent — this only ever runs
// moments after the operation confirmed, so this is a generous safety
// margin, not an expected wait. ~2s block time on Base, so ~33 minutes.
const USER_OP_LOG_SEARCH_BLOCKS = 1_000n;

/**
 * Recovers a real, Basescan-linkable transaction hash from whatever
 * wallet_sendCalls / wallet_getCallsStatus actually gave us. If it's already
 * a genuine 32-byte hash (a wallet that returns proper receipts), returns it
 * unchanged. Otherwise, extracts the userOpHash embedded in a Coinbase-style
 * batch id and looks up the EntryPoint's own UserOperationEvent log for it —
 * every log carries the real transaction hash at the top level regardless of
 * what the wallet's own RPC responses say. Returns null if nothing can be
 * recovered (callers fall back to their existing "hash unavailable" display,
 * exactly as before this existed).
 */
export async function resolveTransactionHash(hashOrBatchId: string): Promise<Hex | null> {
  if (isValidTxHash(hashOrBatchId)) return hashOrBatchId as Hex;

  const userOpHash = extractUserOpHash(hashOrBatchId);
  if (!userOpHash) return null;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > USER_OP_LOG_SEARCH_BLOCKS ? latestBlock - USER_OP_LOG_SEARCH_BLOCKS : 0n;
    const logs = await publicClient.getLogs({
      address: ENTRY_POINT_V06,
      event: userOperationEventAbiItem,
      args: { userOpHash },
      fromBlock,
      toBlock: "latest",
    });
    return logs[0]?.transactionHash ?? null;
  } catch {
    return null;
  }
}
