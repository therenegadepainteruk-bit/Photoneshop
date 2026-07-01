import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("Source loading", () => {
  let W;

  beforeAll(() => {
    // loadSharedContext() throws if any real source file fails to load —
    // reaching the tests below already proves the load succeeded.
    ({ window: W } = loadSharedContext());
  });

  it("core modules attached real exports to window", () => {
    expect(W.PhotoneshopMemory).toBeTruthy();
    expect(W.PhotoneshopErrors).toBeTruthy();
    expect(W.PhotoneshopValidation).toBeTruthy();
    expect(W.PhotoneshopBenchmark).toBeTruthy();
    expect(W.PhotoneshopHalftoneTiled).toBeTruthy();
    expect(W.PhotoneshopHalftoneIntegrated).toBeTruthy();
  });
});
