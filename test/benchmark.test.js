import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("core/benchmark.js (real)", () => {
  let W;

  beforeAll(() => {
    ({ window: W } = loadSharedContext());
  });

  it("Benchmark.start/end computes duration and throughput on real timer", () => {
    const B = W.PhotoneshopBenchmark.Benchmark;
    const bench = new B("unit").start();
    // burn a little time
    let x = 0;
    for (let i = 0; i < 1e5; i++) x += i;
    bench.end(50000);
    const j = bench.toJSON();
    expect(j.durationMS).toBeGreaterThanOrEqual(0);
    expect(j.pixelsProcessed).toBe(50000);
    expect(j.throughputPixelsPerSec).toBeGreaterThanOrEqual(0);
    expect(x).toBeGreaterThanOrEqual(0); // keep optimizer honest
  });

  it("detectRegressions flags a slowdown beyond threshold", () => {
    const base = { benchmarks: [{ name: "op", durationMS: 100, memoryPeakMB: 10 }] };
    const cur = { benchmarks: [{ name: "op", durationMS: 200, memoryPeakMB: 10 }] };
    const regs = W.PhotoneshopBenchmark.detectRegressions(base, cur, 10);
    expect(Array.isArray(regs)).toBe(true);
    expect(regs.length).toBeGreaterThanOrEqual(1);
    expect(regs[0].operation).toBe("op");
  });
});
