import { describe, expect, it } from "vitest";
import { extractCallHashes } from "./eip5792Batch";

describe("extractCallHashes", () => {
  it("uses each call's own receipt hash when all are present", () => {
    const hashes = extractCallHashes(2, "0xbatch", [
      { transactionHash: "0xaaa" },
      { transactionHash: "0xbbb" },
    ]);
    expect(hashes).toEqual(["0xaaa", "0xbbb"]);
  });

  it("falls back to the batch id for any call missing a receipt", () => {
    const hashes = extractCallHashes(3, "0xbatch", [{ transactionHash: "0xaaa" }]);
    expect(hashes).toEqual(["0xaaa", "0xbatch", "0xbatch"]);
  });

  it("falls back to the batch id for every call when receipts are undefined", () => {
    expect(extractCallHashes(2, "0xbatch")).toEqual(["0xbatch", "0xbatch"]);
  });

  it("returns an empty array for zero calls", () => {
    expect(extractCallHashes(0, "0xbatch")).toEqual([]);
  });
});
