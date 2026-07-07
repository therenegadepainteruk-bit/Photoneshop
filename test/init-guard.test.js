import { describe, it, expect } from "vitest";
import { loadFullAppIsolated } from "./helpers/vm-loader.js";

// The ES-modules-vs-UXP tradeoff: core/init-guard.js's assertReady() is the
// runtime safety net that fails loud, immediately, and clearly the moment a
// script fails to load or the load order in index.html changes.
describe("core/init-guard.js (real) — initialization safety net", () => {
  it("assertReady(): full real load order (matching index.html) throws nothing", () => {
    const ctx = loadFullAppIsolated();
    expect(() => ctx.window.PhotoneshopInit.assertReady()).not.toThrow();
  });

  const missingFiles = [
    "engines/print.js",
    "core/preview.js",
    "core/history.js",
    "ai/analysis.js",
    "engines/separation.js",
  ];

  it.each(missingFiles)("assertReady(): correctly detects and names a missing %s", (missingFile) => {
    const ctx = loadFullAppIsolated(missingFile);
    let threw = null;
    try {
      ctx.window.PhotoneshopInit.assertReady();
    } catch (e) {
      threw = e;
    }
    expect(threw, "expected assertReady() to throw when " + missingFile + " failed to load").toBeTruthy();
    expect(threw.name).toBe("PhotoneshopInitError");
    expect(threw.message).toContain(missingFile);
  });
});
