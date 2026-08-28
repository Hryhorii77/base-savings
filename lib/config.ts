import type { Address } from "viem";
import type { ProtocolId } from "./protocols/types";

export const BASE_CHAIN_ID = 8453;

// viem's built-in default RPC for Base is the official https://mainnet.base.org,
// which is rate-limited and not intended for production traffic — observed live
// causing a real user's Moonwell market-data call to hang past a 10s timeout.
// PublicNode's endpoint has materially higher rate limits for free public use.
// Used explicitly everywhere a client is created (wagmi transports and both
// protocol adapters) so nothing silently falls back to the rate-limited default.
export const BASE_RPC_URL = "https://base-rpc.publicnode.com";

// Originally verified against @moonwell-fi/moonwell-sdk's shipped environment
// config, and cross-checked as the `asset.address` returned by Morpho's live
// GraphQL API. That SDK is no longer a dependency (see lib/protocols/moonwell.ts)
// but the address itself doesn't change — re-verify against BaseScan if unsure.
export const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

// Originally verified against @moonwell-fi/moonwell-sdk's shipped config for
// the `base` environment's MOONWELL_USDC market token (the real Moonwell lending
// market, NOT the Morpho vault that happens to be branded "Moonwell Flagship USDC" —
// see the naming-trap note in lib/protocols/morpho.ts). That SDK is no longer a
// dependency (see lib/protocols/moonwell.ts) but the address itself doesn't change.
export const MOONWELL_MUSDC_ADDRESS: Address = "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22";
export const MOONWELL_MUSDC_DECIMALS = 8;

// Verified live on-chain 2026-08-28: Pool.getReserveData(USDC).aTokenAddress
// returned this exact address; both confirmed correct against BaseScan.
export const AAVE_POOL_ADDRESS: Address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
export const AAVE_AUSDC_ADDRESS: Address = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";

// Verified live on-chain 2026-08-28: Comet.baseToken() on this address returns
// USDC_ADDRESS above, confirming this is the Base USDC Comet market (not one of
// Compound's other Base Comet deployments, e.g. for WETH).
export const COMPOUND_COMET_ADDRESS: Address = "0xb125E6687d4313864e53df431d5425969c15Eb2F";

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

// Per-protocol kill switch — set to false to pull a protocol out of new-deposit
// recommendations during a security incident (the allocation engine urges
// withdrawal for anyone already holding a disabled protocol, regardless of its
// APY; see lib/allocation.ts). Withdrawals always stay enabled regardless of
// this flag — it only gates new deposits.
//
// moonwell: false because Moonwell suffered an $8.7M oracle-manipulation
// exploit on Base on 2026-08-27 (illiquid MAMO collateral price was manipulated
// to over-borrow real assets, including USDC — Moonwell responded by setting
// borrow caps to 1 wei across all Base Core Markets). This directly explains
// the near-zero liquidity we'd already been flagging on Moonwell's USDC market.
// Flip back to true once Moonwell's post-incident review is public and the
// market looks healthy again.
// Sources: theblock.co/news/defi/2026-08-27-moonwell-investigates-base-lending-market-issue-412913,
// techtimes.com/articles/325839 ("third failure in 11 months")
export const PROTOCOL_DEPOSITS_ENABLED: Record<ProtocolId, boolean> = {
  morpho: true,
  moonwell: false,
  aave: true,
  compound: true,
};
