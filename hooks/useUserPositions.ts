import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import type { Protocol } from "@/lib/allocation";
import { moonwellAdapter } from "@/lib/protocols/moonwell";
import { morphoAdapter } from "@/lib/protocols/morpho";

export function useUserPositions(userAddress: Address | undefined) {
  return useQuery({
    queryKey: ["user-positions", userAddress],
    enabled: !!userAddress,
    queryFn: async () => {
      const address = userAddress as Address;
      const [morphoBalance, moonwellBalance] = await Promise.all([
        morphoAdapter.getUserBalance(address),
        moonwellAdapter.getUserBalance(address),
      ]);

      const hasMorpho = morphoBalance > 0n;
      const hasMoonwell = moonwellBalance > 0n;
      const currentAllocation: Protocol | "none" | "split" =
        hasMorpho && hasMoonwell
          ? "split"
          : hasMorpho
            ? "morpho"
            : hasMoonwell
              ? "moonwell"
              : "none";

      return { morphoBalance, moonwellBalance, currentAllocation };
    },
    refetchInterval: 30_000,
  });
}
