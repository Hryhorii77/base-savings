# Base Savings

Non-custodial USDC savings on [Base](https://base.org). Compares live lending APY across [Morpho](https://morpho.org), [Moonwell](https://moonwell.fi), [Aave](https://aave.com), and [Compound](https://compound.finance), recommends whichever enabled market is paying more, and flags it when that market's liquidity is too thin to trust blindly. Every deposit, withdrawal, and rebalance is a transaction you sign yourself — the app never takes custody of funds.

**Live:** https://base-savings.vercel.app

## What it does

- Reads real-time USDC supply APY directly from each protocol's own contracts on Base: a Morpho vault (auto-selected: highest APY among vaults with ≥$5M TVL, filtering out dust/manipulated vaults), Moonwell's USDC market, Aave's USDC reserve, and Compound's USDC Comet market.
- Shows live rates on the landing page before you connect a wallet, with a "recommended now" call-out — no need to connect just to see what's on offer.
- Recommends the better-paying *enabled* market, but won't recommend a move for a marginal APY difference (configurable threshold), and flags a **low-liquidity warning** when a market doesn't have enough available liquidity to safely withdraw from — a market can advertise a huge headline rate while sitting at near-100% utilization.
- Per-protocol **kill switch** (`PROTOCOL_DEPOSITS_ENABLED` in `lib/config.ts`): during an active security incident, new deposits into that protocol are disabled and anyone already holding a position there is urged to withdraw, regardless of its APY. Moonwell is currently disabled following its August 2026 oracle-manipulation exploit on Base.
- Every market card links straight to its exact contract on Basescan, so you can verify the numbers — or exit directly through the protocol — without trusting this frontend.
- Connect with **Base Account**, any injected wallet (**MetaMask**, **Rabby**, etc. — auto-detected via EIP-6963), or **WalletConnect**.
- Deposit, withdraw, and rebalance directly against each protocol's own contracts (ERC-4626 for Morpho, native pool/market contracts for Moonwell/Aave/Compound) — no intermediary contract, no custody.
- After connecting, see total saved, estimated monthly/yearly earnings, and recent deposit/withdraw activity (kept locally in your browser) alongside a link to your full history on Basescan.

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
npm run test    # unit tests (allocation engine, protocol adapters, tx history)
npm run lint
npm run build
```

CI runs all three on every push and pull request.

## Project structure

```
app/                  Next.js routes, wagmi config, providers
components/           Wallet connect, dashboard, deposit/withdraw modal, public rate cards
hooks/                React Query hooks wrapping the protocol adapters, local tx history
lib/allocation.ts     Pure recommendation logic (APY + liquidity → recommendation)
lib/txHistory.ts      Local (per-browser) record of deposits/withdrawals made through the app
lib/protocols/        Morpho, Moonwell, Aave, and Compound adapters (APY, balances, transaction building)
```

Each protocol adapter implements the same `ProtocolAdapter` interface (`lib/protocols/types.ts`), so the UI never branches on which protocol it's rendering — adding another yield source later is one new adapter file plus one entry in `lib/protocols/index.ts`.

## Deployment

Auto-deploys to Vercel on every push to `main`.
