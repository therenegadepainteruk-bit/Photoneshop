import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

// Most importantly this file includes a FUNCTIONAL regression test that invokes
// the halftone integration entry point (window.PhotoneshopHalftoneIntegrated.
// applyHalftone) with a mocked Photoshop imaging API and asserts that real
// pixels are read AND written — the exact path that was broken in v5.2 (it
// threw "Original halftone module not loaded" on every call). If that
// regression were present, this test FAILS.
describe("engines/halftone.js — INTEGRATION / REGRESSION (real call, mocked imaging)", () => {
  let W, codeOnly;

  beforeAll(() => {
    let halftoneSrc;
    ({ window: W, halftoneSrc } = loadSharedContext());
    // Static guards that would catch reintroduction of the exact v5.2 bugs.
    // Strip comments first so explanatory prose mentioning the old bug does not trip the guard.
    codeOnly = halftoneSrc
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (leave http:// alone via the [^:] guard)
  });

  it("integration entry point is exported as a function", () => {
    expect(W.PhotoneshopHalftoneIntegrated).toBeTruthy();
    expect(typeof W.PhotoneshopHalftoneIntegrated.applyHalftone).toBe("function");
  });

  it("REGRESSION GUARD: no reference to an unassigned window.PhotoneshopHalftone global", () => {
    const refsBare = /window\.PhotoneshopHalftone(?![A-Za-z])/.test(codeOnly); // not ...Tiled / ...Integrated
    if (refsBare) {
      const assigns = /window\.PhotoneshopHalftone(?![A-Za-z])\s*=/.test(codeOnly);
      expect(assigns).toBe(true); // referenced but never assigned = the v5.2 dead-global bug
    }
  });

  it("REGRESSION GUARD: integration does not call PhotoneshopError.wrap()", () => {
    expect(/PhotoneshopError\.wrap\s*\(/.test(codeOnly)).toBe(false);
  });

  it("REGRESSION GUARD: button path does not route to mock applyHalftoneTiled", () => {
    expect(/applyHalftoneTiled\s*\(/.test(codeOnly)).toBe(false);
  });

  // THE functional test that the old suite lacked: actually run the integration entry
  // point with a mocked PS imaging API and prove pixels are read AND written.
  it("FUNCTIONAL: applyHalftone reads real pixels and writes a real halftone (end-to-end)", async () => {
    const w = 96,
      h = 96;
    // Build a vertical gradient so checkTonalVariation sees variation and dots render.
    const grad = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const tone = Math.round((y / (h - 1)) * 255);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        grad[i] = tone;
        grad[i + 1] = tone;
        grad[i + 2] = tone;
        grad[i + 3] = 255;
      }
    }

    let getCalled = false,
      putCalled = false,
      putBounds = null,
      capturedOut = null;
    W.app = {
      activeDocument: {
        resolution: 300,
        width: w,
        height: h,
        mode: "RGBColor",
        bitsPerChannel: 8,
        activeLayers: [{ name: "src", kind: "pixel", locked: false, allLocked: false }],
      },
    };
    W.imaging = {
      getPixels: async () => {
        getCalled = true;
        return { imageData: { getData: async () => grad, components: 4, width: w, height: h, dispose() {} } };
      },
      createImageDataFromBuffer: async (buf) => {
        capturedOut = buf;
        return { dispose() {} };
      },
      putPixels: async (args) => {
        putCalled = true;
        putBounds = args && args.targetBounds;
      },
    };

    const variation = await W.PhotoneshopHalftoneIntegrated.applyHalftone(12345, 1, () => {});

    expect(getCalled, "getPixels was never called — render did not read the layer").toBe(true);
    expect(putCalled, "putPixels was never called — no halftone was written to the layer").toBe(true);
    expect(putBounds && putBounds.right).toBe(w);
    expect(putBounds && putBounds.bottom).toBe(h);
    expect(capturedOut).toBeInstanceOf(Uint8Array);
    expect(capturedOut.length).toBe(w * h * 4);
    let ink = 0;
    for (let i = 3; i < capturedOut.length; i += 4) if (capturedOut[i] === 255) ink++;
    expect(ink, "written halftone contains zero ink pixels").toBeGreaterThan(0);
    expect(variation && typeof variation.n).toBe("number");
    expect(variation.n, "no tonal-variation result returned").toBeGreaterThan(0);
  });

  // Prove the suite has teeth: if the dead-global pattern were present, the functional
  // test above would throw "Original halftone module not loaded" instead of writing.
  it("FUNCTIONAL: integration surfaces render errors (does not swallow)", async () => {
    W.app = { activeDocument: { resolution: 300, width: 32, height: 32, activeLayers: [] } };
    W.imaging = {
      getPixels: async () => {
        throw new Error("simulated getPixels failure");
      },
      createImageDataFromBuffer: async () => ({ dispose() {} }),
      putPixels: async () => {},
    };
    await expect(W.PhotoneshopHalftoneIntegrated.applyHalftone(1, 1, () => {})).rejects.toThrow(
      /getPixels|halftone-apply/i
    );
  });
});
