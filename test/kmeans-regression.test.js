import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

// Locks in kMeansColors()'s exact numeric output on fixed, deterministic
// inputs — a regression guard for the centroid-seeding allocation cleanup
// (removing an unnecessary .slice() copy that never changed the result,
// since centroids[c] is always fully reassigned, never mutated in place).
// If this ever starts failing, the optimisation broke something real.
describe("engines/separation.js — kMeansColors() exact-output regression guard", () => {
  let context;

  beforeAll(() => {
    ({ context } = loadSharedContext());
  });

  function makeBuffer(pixels) {
    // pixels: [[r,g,b,a], ...] -> flat RGBA Uint8Array
    const buf = new Uint8Array(pixels.length * 4);
    pixels.forEach((p, i) => {
      buf[i * 4] = p[0];
      buf[i * 4 + 1] = p[1];
      buf[i * 4 + 2] = p[2];
      buf[i * 4 + 3] = p[3];
    });
    return buf;
  }

  it("two well-separated colour clusters resolve to their true centroids", () => {
    const pixels = [];
    for (let i = 0; i < 50; i++) pixels.push([10, 10, 10, 255]); // near-black cluster
    for (let i = 0; i < 50; i++) pixels.push([240, 240, 240, 255]); // near-white cluster
    const buf = makeBuffer(pixels);
    const centroids = context.kMeansColors(buf, 4, 2, 8);
    expect(centroids.length).toBe(2);
    const sorted = centroids.slice().sort((a, b) => a.r - b.r);
    expect(sorted[0]).toEqual({ r: 10, g: 10, b: 10 });
    expect(sorted[1]).toEqual({ r: 240, g: 240, b: 240 });
  });

  it("three uneven clusters with varied membership counts — exact current output, locked in as a regression guard", () => {
    // Not asserting an "ideal" clustering here: with an uneven split (30/10/60)
    // and 8 max iterations, k-means' percentile-based seeding legitimately
    // converges the low-sum red+green points into one blended centroid rather
    // than three pure ones — this is real, deterministic behaviour of the
    // existing algorithm, captured exactly as-is so an unrelated change can't
    // silently alter it.
    const pixels = [];
    for (let i = 0; i < 30; i++) pixels.push([50, 0, 0, 255]); // sum 50
    for (let i = 0; i < 10; i++) pixels.push([0, 150, 0, 255]); // sum 150
    for (let i = 0; i < 60; i++) pixels.push([0, 0, 250, 255]); // sum 250
    const buf = makeBuffer(pixels);
    const centroids = context.kMeansColors(buf, 4, 3, 8);
    expect(centroids.length).toBe(3);
    const sorted = centroids.slice().sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
    expect(sorted).toEqual([
      { r: 38, g: 38, b: 0 },
      { r: 0, g: 0, b: 250 },
      { r: 0, g: 0, b: 250 },
    ]);
  });

  it("transparent pixels (alpha < 10) are excluded from clustering", () => {
    const pixels = [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 0], // fully transparent — must not influence the result
      [0, 0, 0, 5], // near-transparent — also excluded (alpha < 10)
    ];
    const buf = makeBuffer(pixels);
    const centroids = context.kMeansColors(buf, 4, 1, 8);
    expect(centroids).toEqual([{ r: 255, g: 0, b: 0 }]);
  });

  it("k larger than the number of distinct opaque pixels clamps down", () => {
    const pixels = [
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ];
    const buf = makeBuffer(pixels);
    const centroids = context.kMeansColors(buf, 4, 8, 8);
    expect(centroids.length).toBe(2);
  });

  it("no opaque pixels at all returns an empty array", () => {
    const buf = makeBuffer([
      [255, 0, 0, 0],
      [0, 255, 0, 3],
    ]);
    expect(context.kMeansColors(buf, 4, 3, 8)).toEqual([]);
  });

  it("a single dominant colour with slight per-pixel noise converges near the true mean", () => {
    const pixels = [];
    const noise = [-2, -1, 0, 1, 2];
    for (let i = 0; i < 100; i++) {
      const n = noise[i % noise.length];
      pixels.push([128 + n, 64 + n, 200 + n, 255]);
    }
    const buf = makeBuffer(pixels);
    const centroids = context.kMeansColors(buf, 4, 1, 8);
    expect(centroids).toEqual([{ r: 128, g: 64, b: 200 }]);
  });
});
