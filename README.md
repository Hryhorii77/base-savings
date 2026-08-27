# Base Savings

Non-custodial USDC savings on [Base](https://base.org). Compares live lending APY between [Morpho](https://morpho.org) and [Moonwell](https://moonwell.fi), recommends whichever is paying more, and flags it when that market's liquidity is too thin to trust blindly. Every deposit, withdrawal, and rebalance is a transaction you sign yourself — the app never takes custody of funds.

**Live:** https://base-savings.vercel.app

## What it does

- Reads real-time USDC supply APY from a Morpho vault (auto-selected: highest APY among vaults with ≥$5M TVL, filtering out dust/manipulated vaults) and Moonwell's USDC market, computed directly from each protocol's contracts on Base.
- Recommends the better-paying market, but won't recommend a move for a marginal APY difference (configurable threshold), and flags a **low-liquidity warning** when the higher-APY option doesn't have enough available liquidity to safely withdraw from — a market can advertise a huge headline rate while sitting at near-100% utilization.
- Connect with **Base Account**, any injected wallet (**MetaMask**, **Rabby**, etc. — auto-detected via EIP-6963), or **WalletConnect**.
- Deposit, withdraw, and rebalance directly against each protocol's own contracts (ERC-4626 for Morpho, Compound v2-style mTokens for Moonwell) — no intermediary contract, no custody.

## Why no third-party indexer

Moonwell's own SDK (`@moonwell-fi/moonwell-sdk`) primarily fetches market data from Moonwell's hosted indexer service before falling back to on-chain reads. That indexer proved unreliable in production for real users, so this app reads `supplyRatePerTimestamp`, `getCash`, `totalBorrows`, and `totalReserves` directly from the mToken contract and computes APY with the standard Compound v2 compounding formula — one less external dependency in the path between "app loads" and "you see real numbers."

## Stack

- Next.js (App Router) + TypeScript
- wagmi + viem for wallet connections and contract calls
- Tailwind for styling
- Vitest for unit tests

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Optional: WalletConnect

WalletConnect is omitted from the wallet picker unless you provide a project ID. Get a free one at [cloud.reown.com](https://cloud.reown.com), then:

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
```

## Testing

```bash
npm run test    # unit tests (allocation engine, protocol adapters)
npm run lint
npm run build
```

CI runs all three on every push and pull request.

## Project structure

```
app/                  Next.js routes, wagmi config, providers
components/           Wallet connect, dashboard, deposit/withdraw modal
hooks/                React Query hooks wrapping the protocol adapters
lib/allocation.ts     Pure recommendation logic (APY + liquidity → recommendation)
lib/protocols/        Morpho and Moonwell adapters (APY, balances, transaction building)
```

Each protocol adapter implements the same `ProtocolAdapter` interface (`lib/protocols/types.ts`), so the UI never branches on which protocol it's rendering — adding a third yield source later is one new adapter file.

## Deployment

Auto-deploys to Vercel on every push to `main`.
