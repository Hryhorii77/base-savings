import type { Address } from "viem";

export const BASE_CHAIN_ID = 8453;

// viem's built-in default RPC for Base is the official https://mainnet.base.org,
// which is rate-limited and not intended for production traffic — observed live
// causing a real user's Moonwell SDK call to hang past a 10s timeout. PublicNode's
// endpoint has materially higher rate limits for free public use. Used explicitly
// everywhere a client is created (wagmi transports, both protocol adapters, and
// the Moonwell SDK client) so nothing silently falls back to the rate-limited default.
export const BASE_RPC_URL = "https://base-rpc.publicnode.com";

// Verified against the installed @moonwell-fi/moonwell-sdk's own shipped
// environment config (node_modules/@moonwell-fi/moonwell-sdk/_types/client/createMoonwellClient.d.ts)
// and cross-checked as the `asset.address` returned by Morpho's live GraphQL API.
export const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

// Verified against the installed @moonwell-fi/moonwell-sdk's shipped config for
// the `base` environment's MOONWELL_USDC market token (the real Moonwell lending
// market, NOT the Morpho vault that happens to be branded "Moonwell Flagship USDC" —
// see the naming-trap note in lib/protocols/morpho.ts).
export const MOONWELL_MUSDC_ADDRESS: Address = "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22";
export const MOONWELL_MUSDC_DECIMALS = 8;

export const MORPHO_GRAPHQL_URL = "https://api.morpho.org/graphql";

// Filters out dust/manipulated Morpho vaults advertising absurd APYs on near-zero
// liquidity (observed live: vaults with <$100 TVL reporting >1000% netApy).
// Confirmed via a live query on 2026-08-27 that real, listed, liquid Base USDC
// vaults (Gauntlet USDC Prime, Spark USDC Vault, Steakhouse USDC — all >$100M TVL)
// sit in the 3-5% netApy range, while dust vaults report >1000%.
export const MORPHO_MIN_VAULT_TVL_USD = 5_000_000;

// Minimum APY edge (in basis points) required before the allocation engine
// recommends moving funds — avoids flagging a move for a difference too small
// to justify the gas cost.
export const MIN_MOVE_THRESHOLD_BPS = 25;

// Below this fraction of available-liquidity-to-total-supplied, a market is
// flagged as low-liquidity: large withdrawals may be constrained even though
// the position itself is healthy. Discovered live: Moonwell's USDC market has
// sat at ~100% utilization (cash ≈ $0 against ~$13M supplied) while advertising
// a very high headline APY — exactly the case this guards against.
export const LOW_LIQUIDITY_THRESHOLD = 0.15;
