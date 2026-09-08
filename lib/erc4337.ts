import { decodeEventLog, type Address, type Hex } from "viem";

// The canonical ERC-4337 EntryPoint v0.6 deployment — same address on every
// chain that supports it, including Base. Confirmed live against a real
// transaction: Basescan itself labels calls to this address "Entry Point 0.6.0".
export const ENTRY_POINT_V06: Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const userOperationEventAbi = [
  {
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
  },
] as const;

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
