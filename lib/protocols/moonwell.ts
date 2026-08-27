import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL, MOONWELL_MUSDC_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import type { ProtocolAdapter, ProtocolApy, TxRequest } from "./types";

// Moonwell's mUSDC is a Compound v2-style mToken, not ERC-4626 — different call
// shape from Morpho's vaults: mint()/redeemUnderlying() instead of deposit()/withdraw(),
// and Compound-style calls return a uint256 error code (0 = success) rather than
// reverting on failure, so callers should check the return value.
const mTokenAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "mintAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "redeemUnderlying",
    stateMutability: "nonpayable",
    inputs: [{ name: "redeemAmount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  // balanceOfUnderlying accrues interest internally but has no side effects visible
  // to a caller that only ever reads via eth_call, so it's safe to treat as a read.
  {
    type: "function",
    name: "balanceOfUnderlying",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  // Per-second interest rate (scaled 1e18) — Base uses a per-timestamp rate
  // model rather than classic Compound's per-block model.
  {
    type: "function",
    name: "supplyRatePerTimestamp",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getCash",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalBorrows",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const moonwellAdapter: ProtocolAdapter = {
  id: "moonwell",

  async getApy(): Promise<ProtocolApy> {
    // Computed directly from the mToken contract rather than via
    // @moonwell-fi/moonwell-sdk's getMarkets(), which primarily calls
    // Moonwell's own third-party indexer ("Lunar") before falling back to
    // on-chain data. Observed live: that indexer can fail/hang for a real
    // user's browser (hundreds of failed requests to
    // lunar-services-worker.moonwell.workers.dev) even though direct RPC
    // calls to the contract succeed reliably — so we skip the indexer
    // dependency entirely and read the two numbers we need ourselves.
    //
    // Note: this intentionally omits WELL token reward APR (a small addition
    // on top of base interest — ~0.05-0.1 percentage points in practice) to
    // avoid needing a price-oracle call just for a minor, volatile add-on.
    const [ratePerSecond, cash, totalBorrows, totalReserves] = await withTimeout(
      Promise.all([
        publicClient.readContract({
          address: MOONWELL_MUSDC_ADDRESS,
          abi: mTokenAbi,
          functionName: "supplyRatePerTimestamp",
        }),
        publicClient.readContract({
          address: MOONWELL_MUSDC_ADDRESS,
          abi: mTokenAbi,
          functionName: "getCash",
        }),
        publicClient.readContract({
          address: MOONWELL_MUSDC_ADDRESS,
          abi: mTokenAbi,
          functionName: "totalBorrows",
        }),
        publicClient.readContract({
          address: MOONWELL_MUSDC_ADDRESS,
          abi: mTokenAbi,
          functionName: "totalReserves",
        }),
      ]),
      10_000,
      "Moonwell mUSDC contract reads"
    );

    // Standard Compound v2 compounding formula: rate is per-second, scaled 1e18.
    const ratePerSecondFraction = Number(ratePerSecond) / 1e18;
    const apyFraction = (1 + ratePerSecondFraction) ** SECONDS_PER_YEAR - 1;

    // Total underlying supplied = cash (idle) + borrowed out - protocol reserves
    // (reserves belong to the protocol, not depositors). Standard Compound v2
    // accounting identity.
    const totalSupplied = cash + totalBorrows - totalReserves;
    const liquidityRatio = totalSupplied > 0n ? Number(cash) / Number(totalSupplied) : 1;

    return {
      protocol: "moonwell",
      apyBps: Math.round(apyFraction * 10_000),
      label: "Moonwell USDC",
      liquidityRatio: Math.min(1, Math.max(0, liquidityRatio)),
    };
  },

  async getUserBalance(userAddress: Address): Promise<bigint> {
    return withTimeout(
      publicClient.readContract({
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "balanceOfUnderlying",
        args: [userAddress],
      }),
      10_000,
      "Moonwell balanceOfUnderlying"
    );
  },

  async buildDepositTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [MOONWELL_MUSDC_ADDRESS, amount],
      },
      {
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "mint",
        args: [amount],
      },
    ];
  },

  async buildWithdrawTx(_userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    return [
      {
        address: MOONWELL_MUSDC_ADDRESS,
        abi: mTokenAbi,
        functionName: "redeemUnderlying",
        args: [amount],
      },
    ];
  },
};
