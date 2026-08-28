import { useQuery } from "@tanstack/react-query";
import { PROTOCOL_ADAPTERS } from "@/lib/protocols";
import type { ProtocolApy } from "@/lib/protocols/types";

export function useProtocolApys() {
  return useQuery<ProtocolApy[]>({
    queryKey: ["protocol-apys"],
    queryFn: () => Promise.all(PROTOCOL_ADAPTERS.map((adapter) => adapter.getApy())),
    // Each tick fans out to a dozen-plus individual RPC calls (4 protocols ×
    // several reads each, unbatched) — observed live tripping PublicNode's
    // free-tier rate limit under real testing load (our polling plus the
    // connected wallets' own background calls to the same endpoint). Batching
    // via viem's multicall would be the real fix; this interval bump is a
    // stopgap to reduce pressure until that's done.
    refetchInterval: 90_000,
    staleTime: 60_000,
    // Default retry (3x with backoff) plus our own 10s per-call timeouts could
    // silently sit on "Loading…" for ~45s before ever surfacing an error.
    retry: 1,
    retryDelay: 2_000,
  });
}
