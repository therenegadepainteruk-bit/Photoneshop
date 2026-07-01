import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

// nearestCentroidIndices()/centroidAlphaMask() (engines/separation.js) —
// extracted from splitChannels()/autoSeparate(), which each used to
// recompute "which centroid is nearest" from scratch inside their own
// per-centroid loop (O(centroids² × pixels)); now computed once and shared
// (O(centroids × pixels)). Hand-verified expected values, not just "whatever
// the code currently produces", since this replaces real per-pixel logic.
describe("engines/separation.js — nearestCentroidIndices()/centroidAlphaMask() (real, hand-verified)", () => {
  let context;

  beforeAll(() => {
    ({ context } = loadSharedContext());
  });

  // 1×4 RGBA image, comps=4. Centroids: black (0,0,0) and white (255,255,255).
  //   px0 (10,10,10,255)    -> distance² to black=300, to white=3×245²=180075 -> nearest black (0)
  //   px1 (245,245,245,255) -> distance² to black=3×245²=180075, to white=3×10²=300 -> nearest white (1)
  //   px2 (0,0,0,5)         -> alpha < 10 -> excluded (-1)
  //   px3 (130,130,130,200) -> distance² to black=3×130²=50700, to white=3×125²=46875 -> nearest white (1)
  const buf = new Uint8Array([10, 10, 10, 255, 245, 245, 245, 255, 0, 0, 0, 5, 130, 130, 130, 200]);
  const centroids = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
  ];

  it("nearestCentroidIndices assigns each opaque pixel to its true nearest centroid, and -1 to near-transparent pixels", () => {
    const idx = context.nearestCentroidIndices(buf, 4, 4, 1, centroids);
    expect(Array.from(idx)).toEqual([0, 1, -1, 1]);
  });

  it("centroidAlphaMask for centroid 0 (black) is nonzero only at px0, using that pixel's real alpha", () => {
    const idx = context.nearestCentroidIndices(buf, 4, 4, 1, centroids);
    const mask = context.centroidAlphaMask(buf, 4, 4, 1, idx, 0);
    expect(Array.from(mask)).toEqual([255, 0, 0, 0]);
  });

  it("centroidAlphaMask for centroid 1 (white) is nonzero at px1 and px3, using each pixel's real (differing) alpha", () => {
    const idx = context.nearestCentroidIndices(buf, 4, 4, 1, centroids);
    const mask = context.centroidAlphaMask(buf, 4, 4, 1, idx, 1);
    // px1's alpha channel is 255 (its RGB is 245,245,245 — not to be confused
    // with its alpha), px3's alpha channel is 200.
    expect(Array.from(mask)).toEqual([0, 255, 0, 200]);
  });

  it("the two masks partition alpha exactly — no pixel's real alpha is double-counted or dropped", () => {
    const idx = context.nearestCentroidIndices(buf, 4, 4, 1, centroids);
    const mask0 = context.centroidAlphaMask(buf, 4, 4, 1, idx, 0);
    const mask1 = context.centroidAlphaMask(buf, 4, 4, 1, idx, 1);
    for (let i = 0; i < 4; i++) {
      expect(mask0[i] > 0 && mask1[i] > 0).toBe(false); // never both nonzero
    }
    expect(mask0[2]).toBe(0);
    expect(mask1[2]).toBe(0); // the near-transparent pixel belongs to neither mask
  });

  it("an exact tie is broken in favour of the first (lower-index) centroid — matches the original inline loop's `d < bestD` strict comparison", () => {
    // Centroids 20 apart on the red channel only; a pixel exactly midway
    // (distance² = 100 to each) is a genuine, exact integer tie.
    const tieCentroids = [
      { r: 0, g: 0, b: 0 },
      { r: 20, g: 0, b: 0 },
    ];
    const tieBuf = new Uint8Array([10, 0, 0, 255]);
    const idx = context.nearestCentroidIndices(tieBuf, 4, 1, 1, tieCentroids);
    expect(idx[0]).toBe(0); // centroid 0 wins the tie, not centroid 1
  });
});
