import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import vm from "node:vm";
import path from "node:path";
import { ROOT, readRepoFile } from "./helpers/vm-loader.js";

// scheduleCoverageUpdate() (core/preview.js) — debounces the footer's ink-
// coverage readout the same way slider input itself is debounced, so a fast
// drag triggers one real getPixels-based sample after settling instead of
// one per preview tick. Loaded into an isolated vm with real (vitest fake)
// timers and a stub updateCoverage() so the debounce timing itself can be
// exercised precisely.
function buildSandbox() {
  let updateCoverageCalls = 0;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    // Indirection so this always resolves the CURRENT global setTimeout/
    // clearTimeout at call time — required so vi.useFakeTimers() (which
    // replaces the global after this sandbox is built) actually takes effect.
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    updateCoverage: () => {
      updateCoverageCalls++;
    },
    val: () => "",
    num: () => 0,
    chk: () => false,
    getDTMode: () => "dtg",
    Math,
    Object,
    Error,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("core/preview.js"), context, { filename: path.join(ROOT, "core/preview.js") });
  return {
    context,
    getUpdateCoverageCalls: () => updateCoverageCalls,
  };
}

describe("core/preview.js — scheduleCoverageUpdate() (real, isolated vm, fake timers)", () => {
  let env;

  beforeEach(() => {
    vi.useFakeTimers();
    env = buildSandbox();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a single call fires updateCoverage() once, after DEBOUNCE_MS", () => {
    env.context.scheduleCoverageUpdate();
    expect(env.getUpdateCoverageCalls()).toBe(0); // not yet — still debouncing
    vi.advanceTimersByTime(130);
    expect(env.getUpdateCoverageCalls()).toBe(1);
  });

  it("rapid repeated calls (simulating a fast drag) fire updateCoverage() only ONCE, not once per call", () => {
    for (let i = 0; i < 10; i++) {
      env.context.scheduleCoverageUpdate();
      vi.advanceTimersByTime(50); // faster than the 130ms debounce window
    }
    expect(env.getUpdateCoverageCalls()).toBe(0); // still debouncing — never went 130ms without a new call
    vi.advanceTimersByTime(130); // let it settle
    expect(env.getUpdateCoverageCalls()).toBe(1); // exactly one real sample, not ten
  });

  it("calls spaced further apart than the debounce window each fire their own update", () => {
    env.context.scheduleCoverageUpdate();
    vi.advanceTimersByTime(130);
    expect(env.getUpdateCoverageCalls()).toBe(1);
    env.context.scheduleCoverageUpdate();
    vi.advanceTimersByTime(130);
    expect(env.getUpdateCoverageCalls()).toBe(2);
  });
});
