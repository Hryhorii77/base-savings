import { useQuery } from "@tanstack/react-query";
import { moonwellAdapter } from "@/lib/protocols/moonwell";
import { morphoAdapter } from "@/lib/protocols/morpho";

export function useProtocolApys() {
  return useQuery({
    queryKey: ["protocol-apys"],
    queryFn: async () => {
      const [morpho, moonwell] = await Promise.all([
        morphoAdapter.getApy(),
        moonwellAdapter.getApy(),
      ]);
      return { morpho, moonwell };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
