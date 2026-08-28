import { useQuery } from "@tanstack/react-query";
import { PROTOCOL_ADAPTERS } from "@/lib/protocols";
import type { ProtocolApy } from "@/lib/protocols/types";

export function useProtocolApys() {
  return useQuery<ProtocolApy[]>({
    queryKey: ["protocol-apys"],
    queryFn: () => Promise.all(PROTOCOL_ADAPTERS.map((adapter) => adapter.getApy())),
    refetchInterval: 30_000,
    staleTime: 15_000,
    // Default retry (3x with backoff) plus our own 10s per-call timeouts could
    // silently sit on "Loading…" for ~45s before ever surfacing an error.
    retry: 1,
    retryDelay: 2_000,
  });
}
