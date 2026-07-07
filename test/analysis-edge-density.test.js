import { describe, it, expect } from "vitest";
import vm from "node:vm";
import path from "node:path";
import { ROOT, readRepoFile } from "./helpers/vm-loader.js";

// computeEdgeDensity() (ai/analysis.js) — extracted from runDeepAnalysis()'s
// inline edge-density loop, which used to recompute an interior pixel's
// luminance up to three times (once as its own value, once as a left
// neighbour's "right" sample, once as a top neighbour's "down" sample).
// Loaded standalone with the real luminance() (core/api.js) — the only bare
// global this pure function reads.
function buildSandbox() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    luminance: (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b,
    Float64Array,
    Math,
  };
  const context = vm.createContext(sandbox);
  // Load just enough of ai/analysis.js to define computeEdgeDensity(); the
  // rest of the file's top-level code is function declarations only, so
  // loading the whole file is safe even without every cross-file global.
  vm.runInContext(readRepoFile("ai/analysis.js"), context, { filename: path.join(ROOT, "ai/analysis.js") });
  return context;
}

describe("ai/analysis.js — computeEdgeDensity() (real, isolated vm, hand-verified)", () => {
  it("hand-computed 3×2 grey ramp — luminance(r,g,g) for a true grey pixel equals r exactly (weights sum to 1.0)", () => {
    const context = buildSandbox();
    // 3x2 RGB (comps=3), luma grid:
    //   0   100  200
    //   50  150  250
    // Interior differences (y=0, x=0..1):
    //   x=0: |0-100| + |0-50|   = 150
    //   x=1: |100-200| + |100-150| = 150
    // edgeSum=300, edgeSamples=2 -> edgeDensity = 300/2/255
    const buf = new Uint8Array([0, 0, 0, 100, 100, 100, 200, 200, 200, 50, 50, 50, 150, 150, 150, 250, 250, 250]);
    const density = context.computeEdgeDensity(buf, 3, 3, 2);
    expect(density).toBeCloseTo(300 / 2 / 255, 10);
  });

  it("a perfectly flat image has zero edge density", () => {
    const context = buildSandbox();
    const buf = new Uint8Array(3 * 3 * 3).fill(128); // 3x3, every pixel identical
    const density = context.computeEdgeDensity(buf, 3, 3, 3);
    expect(density).toBe(0);
  });

  it("a 1-pixel-wide or 1-pixel-tall image (no interior neighbours) returns 0, not NaN", () => {
    const context = buildSandbox();
    const buf = new Uint8Array([10, 10, 10, 200, 200, 200]); // 2x1
    expect(context.computeEdgeDensity(buf, 3, 2, 1)).toBe(0);
    expect(context.computeEdgeDensity(buf, 3, 1, 2)).toBe(0);
  });

  it("matches an independent, unoptimised (recompute-every-time) reference implementation EXACTLY (double precision throughout — a Float32Array cache would silently round and fail this) on a larger random buffer", () => {
    const context = buildSandbox();
    const w = 17,
      h = 13,
      comps = 4;
    const buf = new Uint8Array(w * h * comps);
    // Deterministic pseudo-random fill (no external RNG dependency).
    let seed = 12345;
    for (let i = 0; i < buf.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      buf[i] = seed % 256;
    }
    const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    let edgeSum = 0,
      edgeSamples = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const idx = (y * w + x) * comps;
        const idxR = idx + comps;
        const idxD = idx + w * comps;
        const g0 = luminance(buf[idx], buf[idx + 1], buf[idx + 2]);
        const gR = luminance(buf[idxR], buf[idxR + 1], buf[idxR + 2]);
        const gD = luminance(buf[idxD], buf[idxD + 1], buf[idxD + 2]);
        edgeSum += Math.abs(g0 - gR) + Math.abs(g0 - gD);
        edgeSamples++;
      }
    }
    const reference = edgeSamples ? edgeSum / edgeSamples / 255 : 0;
    const actual = context.computeEdgeDensity(buf, comps, w, h);
    expect(actual).toBe(reference); // exact — no floating-point tolerance needed
  });
});
