import { describe, expect, it } from "vitest";
import { toSendCalls } from "./rebalanceCalls";
import type { TxRequest } from "./protocols/types";

const abi = [{ type: "function", name: "approve" }] as const;

function tx(overrides: Partial<TxRequest> = {}): TxRequest {
  return {
    address: "0x1111111111111111111111111111111111111111",
    abi,
    functionName: "approve",
    args: ["0x2222222222222222222222222222222222222222", 1000n],
    ...overrides,
  };
}

describe("toSendCalls", () => {
  it("maps address to `to` and preserves abi/functionName/args", () => {
    const [call] = toSendCalls([tx()]);
    expect(call).toEqual({
      to: "0x1111111111111111111111111111111111111111",
      abi,
      functionName: "approve",
      args: ["0x2222222222222222222222222222222222222222", 1000n],
    });
  });

  it("preserves call order across multiple txs", () => {
    const calls = toSendCalls([
      tx({ functionName: "withdraw" }),
      tx({ functionName: "deposit" }),
    ]);
    expect(calls.map((c) => c.functionName)).toEqual(["withdraw", "deposit"]);
  });

  it("returns an empty array for no txs", () => {
    expect(toSendCalls([])).toEqual([]);
  });
});
