import type { Address, Hex } from "viem";
import { describe, expect, it } from "vitest";
import { ENTRY_POINT_V06, hasFailedUserOperation } from "./erc4337";

const SENDER: Address = "0x9b3F205E43dc9FcC1cc2Fe6d9dCD0357769A6Bae";

// Pulled live from a real reverted withdrawal:
// https://basescan.org/tx/0x477a9a91619447b5b8980a20ad88772dfdeda3e271daee8494eddc5282e808b6
// The outer transaction's own receipt.status read 'success' (the bundler
// still got paid) while this event's `success` field — decoded — is false.
const REAL_FAILED_LOG = {
  address: ENTRY_POINT_V06,
  topics: [
    "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f",
    "0x71ad80ea3213e70f1563c143ffa85f8e8536bdf0278fcdc8a0d066dcdc8e28fa",
    "0x0000000000000000000000009b3f205e43dc9fcc1cc2fe6d9dcd0357769a6bae",
    "0x0000000000000000000000002faeb0760d4230ef2ac21496bb4f0b47d634fd4c",
  ],
  data: "0x00000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e41dc6e1c000000000000000000000000000000000000000000000000000000000000a0b16",
} as const;

describe("hasFailedUserOperation", () => {
  it("detects the real failed withdrawal's UserOperationEvent", () => {
    expect(hasFailedUserOperation([REAL_FAILED_LOG], SENDER)).toBe(true);
  });

  it("is case-insensitive when matching the sender address", () => {
    expect(hasFailedUserOperation([REAL_FAILED_LOG], SENDER.toLowerCase() as Address)).toBe(true);
    expect(hasFailedUserOperation([REAL_FAILED_LOG], SENDER.toUpperCase() as Address)).toBe(true);
  });

  it("ignores a failed UserOperationEvent belonging to a different sender", () => {
    const otherSender: Address = "0x000000000000000000000000000000000000aa";
    expect(hasFailedUserOperation([REAL_FAILED_LOG], otherSender)).toBe(false);
  });

  it("ignores logs from contracts other than the EntryPoint", () => {
    const spoofed = { ...REAL_FAILED_LOG, address: "0x000000000000000000000000000000000000bb" as Address };
    expect(hasFailedUserOperation([spoofed], SENDER)).toBe(false);
  });

  it("ignores EntryPoint logs with a different topic0", () => {
    const otherTopic0 = (("0x" + "1".repeat(64)) as Hex);
    const otherEvent = { ...REAL_FAILED_LOG, topics: [otherTopic0, ...REAL_FAILED_LOG.topics.slice(1)] };
    expect(hasFailedUserOperation([otherEvent], SENDER)).toBe(false);
  });

  it("returns false for an empty log list (plain EOA transactions)", () => {
    expect(hasFailedUserOperation([], SENDER)).toBe(false);
  });

  it("returns false for a successful UserOperationEvent", () => {
    // Same real data, but with the `success` word (2nd of 4, 64 hex chars
    // each) flipped from all-zero to a trailing 1.
    const successfulLog = {
      ...REAL_FAILED_LOG,
      data: ("0x" +
        "0000000000000000000000000000000000000000000000000000000000000003" +
        "0000000000000000000000000000000000000000000000000000000000000001" +
        "000000000000000000000000000000000000000000000000000003e41dc6e1c0" +
        "00000000000000000000000000000000000000000000000000000000000a0b16") as `0x${string}`,
    };
    expect(hasFailedUserOperation([successfulLog], SENDER)).toBe(false);
  });
});
