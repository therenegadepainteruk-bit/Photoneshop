import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext, readRepoFile } from "./helpers/vm-loader.js";

describe("engines/separation.js (real) — auto separation", () => {
  let context;

  beforeAll(() => {
    ({ context } = loadSharedContext());
  });

  it("rgbToCmyk: pure black -> k=1, c=m=y=0", () => {
    const r = context.rgbToCmyk(0, 0, 0);
    expect(Math.round(r.k * 100)).toBe(100);
    expect(Math.round(r.c * 100)).toBe(0);
    expect(Math.round(r.m * 100)).toBe(0);
    expect(Math.round(r.y * 100)).toBe(0);
  });

  it("rgbToCmyk: pure white -> c=m=y=k=0", () => {
    const r = context.rgbToCmyk(255, 255, 255);
    expect(Math.round(r.c * 100)).toBe(0);
    expect(Math.round(r.m * 100)).toBe(0);
    expect(Math.round(r.y * 100)).toBe(0);
    expect(Math.round(r.k * 100)).toBe(0);
  });

  it("rgbToCmyk: pure red -> m=y=1, c=k=0 (red = magenta+yellow)", () => {
    const r = context.rgbToCmyk(255, 0, 0);
    expect(Math.round(r.c * 100)).toBe(0);
    expect(Math.round(r.m * 100)).toBe(100);
    expect(Math.round(r.y * 100)).toBe(100);
    expect(Math.round(r.k * 100)).toBe(0);
  });

  it("nearestSimInk: near-black snaps to Sim Black, not Sim White", () => {
    const ink = context.nearestSimInk(10, 10, 10);
    expect(ink.name).toBe("Sim Black");
  });

  it("CMYK_ANGLES uses the classic 15/75/0/45 prepress convention (anti-moiré spacing)", () => {
    // CMYK_ANGLES is a top-level `const`, so (like a real <script> tag) it lives in the
    // module's lexical scope, not as a vm-context property — check the real source text
    // directly, same approach already used for the other constant-value regression guards.
    const src = readRepoFile("engines/separation.js");
    expect(/CMYK_ANGLES\s*=\s*\{\s*c:\s*15,\s*m:\s*75,\s*y:\s*0,\s*k:\s*45\s*\}/.test(src)).toBe(true);
  });

  it("REGRESSION GUARD: writeChannelLayer upscales to full document size (canvas-coverage fix)", () => {
    const src = readRepoFile("engines/separation.js");
    expect(/function writeChannelLayer[\s\S]{0,400}upscaleNearest/.test(src)).toBe(true);
  });

  it("autoSeparate is exported as a real function", () => {
    expect(typeof context.autoSeparate).toBe("function");
  });
});
