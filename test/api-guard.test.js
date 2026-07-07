import { describe, it, expect, beforeAll } from "vitest";
import { loadIsolated } from "./helpers/vm-loader.js";

// guard() runs first in applyHalftoneEngine(). If it false-blocks real RGB
// documents (the doc.colorModel bug: undefined !== "RGB" => blocked), the
// halftone button never runs on a real document, regardless of the
// integration wiring. These tests load the REAL core/api.js and call the
// REAL guard().
describe("core/api.js guard() (real, isolated vm) — the gate on EVERY tool incl. halftone", () => {
  let api;

  beforeAll(() => {
    api = loadIsolated("core/api.js");
  });

  it("core/api.js loads (with photoshop/uxp stubbed) and exposes guard()", () => {
    expect(typeof api.context.guard).toBe("function");
  });

  it('HEADLINE GUARD: guard() PASSES a real UXP RGB document (doc.mode="RGBColorMode", no colorModel)', () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = { mode: "RGBColorMode" }; // real shape: no colorModel
    expect(api.context.guard()).toBe(true);
  });

  it('guard() BLOCKS a real UXP CMYK document (doc.mode="CMYKColorMode")', () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = { mode: "CMYKColorMode" };
    expect(api.context.guard()).toBe(false);
  });

  it("guard() does NOT false-block when colour mode is unreadable", () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = {}; // no mode, no colorModel
    expect(api.context.guard()).toBe(true);
  });
});
