import type { QueryClient } from "@tanstack/react-query";

// A transaction confirming on-chain doesn't guarantee every RPC read
// immediately reflects it. Observed live: right after a deposit landed, the
// dashboard briefly showed the pre-deposit balance before correcting itself
// a few seconds later on the next background poll — PublicNode load-balances
// reads across multiple backend nodes, and a read moments after confirmation
// can land on one that hasn't caught up to the very latest block yet.
//
// Refetching once immediately (so the common case updates instantly) and
// again shortly after (so a node that raced ahead of full propagation gets a
// second, later chance) covers both without waiting an extra few seconds on
// every single successful transaction.
export async function refreshPositionsAfterTx(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["user-positions"] });
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["user-positions"] });
  }, 3_000);
}
