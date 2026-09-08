import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshPositionsAfterTx } from "./refreshPositions";

function fakeQueryClient() {
  return { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("refreshPositionsAfterTx", () => {
  it("invalidates user-positions immediately", async () => {
    const client = fakeQueryClient();
    await refreshPositionsAfterTx(client as never);
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["user-positions"] });
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  });

  it("invalidates a second time a few seconds later, to catch a lagging RPC node", async () => {
    const client = fakeQueryClient();
    await refreshPositionsAfterTx(client as never);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("does not fire the delayed retry early", async () => {
    const client = fakeQueryClient();
    await refreshPositionsAfterTx(client as never);

    await vi.advanceTimersByTimeAsync(2_999);
    expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
