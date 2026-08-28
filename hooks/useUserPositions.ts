import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { PROTOCOL_ADAPTERS } from "@/lib/protocols";
import type { ProtocolId } from "@/lib/protocols/types";

export interface UserPositions {
  balances: Partial<Record<ProtocolId, bigint>>;
  heldProtocols: ProtocolId[];
}

export function useUserPositions(userAddress: Address | undefined) {
  return useQuery<UserPositions>({
    queryKey: ["user-positions", userAddress],
    enabled: !!userAddress,
    queryFn: async () => {
      const address = userAddress as Address;
      const balanceEntries = await Promise.all(
        PROTOCOL_ADAPTERS.map(async (adapter) => [adapter.id, await adapter.getUserBalance(address)] as const)
      );

      const balances = Object.fromEntries(balanceEntries) as Partial<Record<ProtocolId, bigint>>;
      const heldProtocols = balanceEntries.filter(([, balance]) => balance > 0n).map(([id]) => id);

      return { balances, heldProtocols };
    },
    refetchInterval: 90_000,
    retry: 1,
    retryDelay: 2_000,
  });
}
