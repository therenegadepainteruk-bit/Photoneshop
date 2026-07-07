import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("engines/halftone-tiled.js (real tile math + honest guard)", () => {
  let W;

  beforeAll(() => {
    ({ window: W } = loadSharedContext());
  });

  it("tiledHalftoneRender (exported) produces real tiles with ink for a dark source", async () => {
    const w = 300,
      h = 300,
      depth = 4; // > TILE_SIZE so multiple tiles are produced
    const src = new Uint8Array(w * h * depth);
    for (let i = 0; i < w * h; i++) {
      src[i * 4 + 3] = 255;
    } // opaque, tone=0 (darkest) => max dot
    const tiles = await W.PhotoneshopHalftoneTiled.tiledHalftoneRender(
      src,
      depth,
      w,
      h,
      { lpi: 45, angle: 45, dotGain: 0, dpi: 300, inkR: 0, inkG: 0, inkB: 0 },
      () => {}
    );
    expect(Array.isArray(tiles)).toBe(true);
    expect(tiles.length).toBeGreaterThan(1);
    let ink = 0;
    for (const t of tiles) {
      for (let i = 3; i < t.pixels.length; i += 4) if (t.pixels[i] === 255) ink++;
    }
    expect(ink).toBeGreaterThan(0);
  });

  it("applyHalftoneTiled THROWS (experimental, not a silent fake success)", async () => {
    await expect(W.PhotoneshopHalftoneTiled.applyHalftoneTiled({}, {}, () => {})).rejects.toThrow(
      /experimental|not implemented/i
    );
  });
});
