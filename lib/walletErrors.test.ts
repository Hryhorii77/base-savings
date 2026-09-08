import { describe, expect, it } from "vitest";
import { friendlyError, TransactionRevertedError } from "./walletErrors";

describe("friendlyError", () => {
  it("gives a specific message for a reverted transaction", () => {
    const message = friendlyError(new TransactionRevertedError("0xabc"));
    expect(message).toMatch(/reverted/i);
    expect(message).toMatch(/refresh and try again/i);
  });

  it("gives a specific message for a user rejection", () => {
    const err = Object.assign(new Error("User rejected the request"), {
      name: "UserRejectedRequestError",
    });
    expect(friendlyError(err)).toBe("Cancelled — nothing was signed.");
  });

  it("falls back to a generic message for a non-Error value", () => {
    expect(friendlyError("some string")).toBe("Transaction failed.");
  });

  it("keeps only the first line of a multi-line viem error", () => {
    const err = new Error("Contract call reverted.\nDocs: https://viem.sh/...\nDetails: ...");
    expect(friendlyError(err)).toBe("Contract call reverted.");
  });
});

describe("TransactionRevertedError", () => {
  it("includes the transaction hash in its message", () => {
    const err = new TransactionRevertedError("0xdeadbeef");
    expect(err.message).toContain("0xdeadbeef");
    expect(err.name).toBe("TransactionRevertedError");
  });
});
