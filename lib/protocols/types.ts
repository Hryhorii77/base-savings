import type { Address } from "viem";

export type ProtocolId = "morpho" | "moonwell" | "aave" | "compound";

export interface ProtocolApy {
  protocol: ProtocolId;
  apyBps: number;
  /** Human-readable label for the specific market/vault backing this APY, e.g. "Steakhouse USDC". */
  label: string;
  /**
   * Available-to-withdraw liquidity as a fraction (0-1) of total assets supplied.
   * A high headline APY can coexist with near-zero liquidity (e.g. a lending
   * market at ~100% utilization) — this flags that risk independently of APY.
   */
  liquidityRatio: number;
  /**
   * On-chain address of the exact market/vault this APY was read from — lets
   * the UI link straight to Basescan so a user can verify the number (or exit
   * directly through the protocol) without trusting this frontend.
   */
  contractAddress: Address;
}

export interface TxRequest {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

export interface ProtocolAdapter {
  readonly id: ProtocolId;
  getApy(): Promise<ProtocolApy>;
  getUserBalance(userAddress: Address): Promise<bigint>;
  buildDepositTx(userAddress: Address, amount: bigint): Promise<TxRequest[]>;
  buildWithdrawTx(userAddress: Address, amount: bigint): Promise<TxRequest[]>;
}
