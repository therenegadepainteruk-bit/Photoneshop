import { describe, it, expect, beforeAll } from "vitest";
import { loadSharedContext } from "./helpers/vm-loader.js";

describe("core/errors.js (real)", () => {
  let W;

  beforeAll(() => {
    ({ window: W } = loadSharedContext());
  });

  it("PhotoneshopError uses real (operation, details, cause) constructor", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    const cause = new Error("root cause");
    const e = new E("halftone-apply", "something failed", cause);
    expect(e.message).toContain("halftone-apply");
    expect(e.message).toContain("something failed");
    expect(e.operation).toBe("halftone-apply");
    expect(e.toString()).toContain("root cause");
  });

  it("PhotoneshopError.withLayerState populates layer context", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    const e = new E("op", "detail").withLayerState({ name: "L1", kind: "pixel", visible: true, opacity: 100 });
    expect(e.layerState && e.layerState.name).toBe("L1");
    expect(e.toString()).toContain("L1");
  });

  it("PhotoneshopError has NO static .wrap (integration must not rely on it)", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    expect(typeof E.wrap).not.toBe("function");
  });
});
