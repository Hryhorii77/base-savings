import { type Address, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  MORPHO_GRAPHQL_URL,
  MORPHO_MIN_VAULT_TVL_USD,
  USDC_ADDRESS,
} from "@/lib/config";
import type { ProtocolAdapter, ProtocolApy, TxRequest } from "./types";

// NAMING TRAP: Morpho has a curated vault literally named "Moonwell Flagship USDC"
// (and a v1 predecessor) — it is a MORPHO vault (ERC-4626, deposits routed through
// Morpho Blue markets) that happens to be curated with Moonwell's branding. It is
// NOT a deposit into Moonwell's own lending market (see lib/protocols/moonwell.ts).
// The vault discovery below queries live and labels vaults by their actual on-chain
// name, so this never gets silently conflated with the real Moonwell integration —
// but if you ever hardcode a vault address here, do not assume a "Moonwell"-named
// Morpho vault belongs in moonwell.ts.

const erc4626Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
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

interface MorphoVaultInfo {
  address: Address;
  name: string;
  netApyBps: number;
  liquidityRatio: number;
}

const publicClient = createPublicClient({ chain: base, transport: http() });

let cachedVault: MorphoVaultInfo | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

async function fetchTopUsdcVault(): Promise<MorphoVaultInfo> {
  if (cachedVault && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedVault;
  }

  const query = `query {
    vaults(first: 10, orderBy: TotalAssetsUsd, orderDirection: Desc, where: { chainId_in: [8453], assetSymbol_in: ["USDC"] }) {
      items {
        address
        name
        listed
        state {
          netApy
          totalAssetsUsd
          allocation { supplyAssetsUsd market { state { liquidityAssetsUsd } } }
        }
      }
    }
  }`;

  const res = await fetch(MORPHO_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Morpho GraphQL request failed: ${res.status}`);
  const json = await res.json();
  const items: Array<{
    address: string;
    name: string;
    listed: boolean;
    state: {
      netApy: number;
      totalAssetsUsd: number;
      allocation: Array<{
        supplyAssetsUsd: number;
        market: { state: { liquidityAssetsUsd: number } };
      }>;
    };
  }> = json.data?.vaults?.items ?? [];

  // Sorted by TVL desc from the query; among vaults with real liquidity, pick the
  // highest APY. This deliberately avoids picking by raw APY first, which surfaces
  // dust/manipulated vaults (observed: <$100 TVL vaults reporting >1000% netApy).
  const eligible = items.filter(
    (v) => v.listed && v.state.totalAssetsUsd >= MORPHO_MIN_VAULT_TVL_USD
  );
  if (eligible.length === 0) {
    throw new Error("No eligible Morpho USDC vault found on Base (all below TVL floor)");
  }
  const best = eligible.reduce((a, b) => (b.state.netApy > a.state.netApy ? b : a));

  // A vault can't withdraw more from a given Blue market than that market's own
  // available liquidity, even if the vault itself supplied more — sum the
  // per-market withdrawable cap (bounded by both the vault's own allocation and
  // that market's liquidity) to approximate the vault's true available liquidity.
  const withdrawableUsd = best.state.allocation.reduce(
    (sum, a) => sum + Math.min(a.supplyAssetsUsd, a.market.state.liquidityAssetsUsd),
    0
  );
  const liquidityRatio =
    best.state.totalAssetsUsd > 0 ? withdrawableUsd / best.state.totalAssetsUsd : 1;

  cachedVault = {
    address: best.address as Address,
    name: best.name,
    netApyBps: Math.round(best.state.netApy * 10_000),
    liquidityRatio: Math.min(1, liquidityRatio),
  };
  cachedAt = Date.now();
  return cachedVault;
}

export const morphoAdapter: ProtocolAdapter = {
  id: "morpho",

  async getApy(): Promise<ProtocolApy> {
    const vault = await fetchTopUsdcVault();
    return {
      protocol: "morpho",
      apyBps: vault.netApyBps,
      label: vault.name,
      liquidityRatio: vault.liquidityRatio,
    };
  },

  async getUserBalance(userAddress: Address): Promise<bigint> {
    const vault = await fetchTopUsdcVault();
    const shares = await publicClient.readContract({
      address: vault.address,
      abi: erc4626Abi,
      functionName: "balanceOf",
      args: [userAddress],
    });
    return publicClient.readContract({
      address: vault.address,
      abi: erc4626Abi,
      functionName: "convertToAssets",
      args: [shares],
    });
  },

  async buildDepositTx(userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    const vault = await fetchTopUsdcVault();
    return [
      {
        address: USDC_ADDRESS,
        abi: erc20ApproveAbi,
        functionName: "approve",
        args: [vault.address, amount],
      },
      {
        address: vault.address,
        abi: erc4626Abi,
        functionName: "deposit",
        args: [amount, userAddress],
      },
    ];
  },

  async buildWithdrawTx(userAddress: Address, amount: bigint): Promise<TxRequest[]> {
    const vault = await fetchTopUsdcVault();
    return [
      {
        address: vault.address,
        abi: erc4626Abi,
        functionName: "withdraw",
        args: [amount, userAddress, userAddress],
      },
    ];
  },
};
