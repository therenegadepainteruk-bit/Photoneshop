import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("core/validation.js (real)", () => {
  let W;

  beforeAll(() => {
    ({ window: W } = loadSharedContext());
  });

  it("runAllChecks returns {allPass, results} shape on real call", () => {
    const doc = { mode: "RGBColorMode", bitsPerChannel: 8, width: 64, height: 64, resolution: 300 };
    const layer = { name: "L", kind: "pixel", locked: false, allLocked: false };
    const r = W.PhotoneshopValidation.runAllChecks(doc, layer, 50);
    expect(typeof r.allPass).toBe("boolean");
    expect(typeof r.results).toBe("object");
    const entries = Object.values(r.results);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e && typeof e.pass === "boolean")).toBe(true);
  });

  it('validateRGBMode PASSES a real UXP RGB document (doc.mode = "RGBColorMode", no colorModel)', () => {
    // This is the exact real-world shape that the colorModel bug failed on.
    const res = W.PhotoneshopValidation.validateRGBMode({ mode: "RGBColorMode" });
    expect(res && res.pass).toBe(true);
  });

  it('validateRGBMode FAILS a real UXP CMYK document (doc.mode = "CMYKColorMode")', () => {
    const res = W.PhotoneshopValidation.validateRGBMode({ mode: "CMYKColorMode" });
    expect(res && res.pass).toBe(false);
  });

  it("validateRGBMode does NOT false-fail when colour mode is unreadable", () => {
    const res = W.PhotoneshopValidation.validateRGBMode({}); // no mode, no colorModel
    expect(res.pass).toBe(true);
    expect(res.indeterminate).toBe(true);
  });
});
