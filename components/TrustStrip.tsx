export function TrustStrip() {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <p>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Non-custodial.</span>{" "}
        You sign every deposit, withdrawal, and rebalance yourself — this app never takes
        custody of your funds and has no admin key over your position. Each market card
        above links to its exact contract on Basescan; if this site ever goes away, you can
        withdraw directly from Morpho, Aave, or Compound without it.
      </p>
      <p className="mt-2">
        <a
          href="https://github.com/Hryhorii77/base-savings"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Source code on GitHub ↗
        </a>
      </p>
    </div>
  );
}
