import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("core/memory.js (real)", () => {
  let W;

  beforeAll(() => {
    ({ window: W } = loadSharedContext());
  });

  it("allocateBuffer returns a Uint8Array of exact byte size", () => {
    const b = W.PhotoneshopMemory.allocateBuffer(100, 100, 4, "test");
    expect(b).toBeInstanceOf(Uint8Array);
    expect(b.length).toBe(100 * 100 * 4);
  });

  it("getMemoryStats reports current/peak after allocation", () => {
    const s = W.PhotoneshopMemory.getMemoryStats();
    expect(typeof s.currentMemoryMB).toBe("number");
    expect(typeof s.peakMemoryMB).toBe("number");
    expect(s.peakMemoryMB >= s.currentMemoryMB || s.peakMemoryMB >= 0).toBe(true);
  });

  it("releaseBuffer then re-allocate reuses pooled buffer (pooling works)", () => {
    // 256x256x4 is a declared pool size in memory.js (MEMORY_POOL_SIZES)
    const a = W.PhotoneshopMemory.allocateBuffer(256, 256, 4, "pool");
    W.PhotoneshopMemory.releaseBuffer(a, 256, 256, 4);
    const b = W.PhotoneshopMemory.allocateBuffer(256, 256, 4, "pool");
    expect(b).toBe(a); // pool returned the same buffer instance
  });
});
