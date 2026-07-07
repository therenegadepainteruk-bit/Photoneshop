/**
 * test/helpers/vm-loader.js — shared vm-context loading utilities
 *
 * Loads the ACTUAL shipped source files (core/*.js, engines/*.js, etc.) into a
 * Node `vm` context that mocks the UXP/Photoshop globals those files expect at
 * runtime (window, document, require("photoshop")/require("uxp")), then hands
 * back the live sandbox so tests can call the REAL exported functions and
 * assert on their REAL behaviour — this does not reimplement any module as an
 * inline mock, only the surrounding Photoshop/UXP host.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Known Halftone-tab slider ids the real val()/num() (core/api.js) need to
// resolve during a render — mirrors what the UI would provide via
// document.getElementById.
export const HT_PARAMS = { htAngle: "45", lpi: "45", dotGain: "0", dpi: "300" };

function fakeRequire(name) {
  if (name === "photoshop") {
    return { app: {}, core: {}, action: { batchPlay: () => {} }, imaging: {} };
  }
  if (name === "uxp") {
    return { storage: { localFileSystem: {} }, entrypoints: { setup: () => {} } };
  }
  throw new Error("unexpected require: " + name);
}

export function readRepoFile(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error("MISSING source file: " + rel);
  return fs.readFileSync(p, "utf8");
}

/**
 * Loads the shared load order most of the suite depends on — everything
 * engines/halftone.js and engines/separation.js need loaded ahead of them
 * (memory, errors, validation, benchmark, api, halftone-tiled, halftone,
 * separation) — into a single fresh vm context.
 *
 * Call this once per test file (in a beforeAll) rather than sharing one
 * context across files: each file gets its own independent, freshly-loaded
 * sandbox, so no test can leak state into another file.
 *
 * @returns {{ window: object, context: object, halftoneSrc: string }}
 *   `window` and `context` are the same object (the vm's contextified
 *   global — top-level `function` declarations in the loaded scripts attach
 *   to it, exactly like a real classic <script> tag attaches to window).
 *   `halftoneSrc` is the raw source text of engines/halftone.js, used by
 *   static regression-guard assertions.
 */
export function loadSharedContext() {
  const documentStub = {
    getElementById: (id) =>
      id in HT_PARAMS ? { value: HT_PARAMS[id], classList: { add() {}, remove() {}, toggle() {} } } : null,
  };
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} }, // quiet module-internal logging
    performance,
    setTimeout: (fn) => fn(), // run "yield to event loop" synchronously in tests
    require: fakeRequire,
    document: documentStub,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Array,
    Math,
    JSON,
    Date,
    Promise,
    Object,
    Number,
    String,
    Boolean,
    Error,
    // Fallback helper globals (api.js overrides these with the real implementations on load):
    val: (id) => (id in HT_PARAMS ? HT_PARAMS[id] : ""),
    num: (id) => parseFloat(HT_PARAMS[id]) || 0,
    setWriteInProgress: () => {},
    window: {},
  };
  sandbox.window.console = sandbox.console;
  sandbox.window.performance = performance;
  const context = vm.createContext(sandbox);

  const load = (rel) => {
    const code = readRepoFile(rel);
    vm.runInContext(code, context, { filename: path.join(ROOT, rel) });
    return code;
  };

  load("core/memory.js");
  load("core/errors.js");
  load("core/validation.js");
  load("core/benchmark.js");
  load("core/api.js");
  load("engines/halftone-tiled.js");
  const halftoneSrc = load("engines/halftone.js");
  load("engines/separation.js");

  return { window: sandbox.window, context, halftoneSrc };
}

/**
 * Loads a single module that does require("photoshop")/require("uxp") at top
 * level into its OWN isolated vm context, with a directly-mutable fake
 * Photoshop app object, so tests can drive doc state test-by-test. Used to
 * exercise the REAL core/api.js guard(), which gates every tool (including
 * the halftone button).
 *
 * @returns {{ context: object, fakePhotoshop: object }}
 */
export function loadIsolated(rel) {
  const code = readRepoFile(rel);
  const fakePhotoshop = {
    app: { documents: [], activeDocument: null },
    core: { executeAsModal: async (fn) => fn() },
    action: { batchPlay: async () => [] },
    imaging: {},
  };
  const fakeUxp = { storage: { localFileSystem: {} }, entrypoints: { setup: () => {} } };
  const elStub = () => ({ classList: { add() {}, remove() {} }, className: "", textContent: "", value: "" });
  const sandbox = {
    require: (m) => (m === "photoshop" ? fakePhotoshop : m === "uxp" ? fakeUxp : {}),
    window: {},
    document: { getElementById: () => elStub() },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => fn(),
    Math,
    JSON,
    Date,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    parseFloat,
    parseInt,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context, { filename: path.join(ROOT, rel) });
  return { context, fakePhotoshop };
}

// The complete real load order from index.html (everything ui/panels.js
// depends on — ui/panels.js itself isn't included since nothing in REQUIRED
// expects anything FROM it).
export const FULL_LOAD_ORDER = [
  "core/memory.js",
  "core/errors.js",
  "core/validation.js",
  "core/benchmark.js",
  "core/api.js",
  "core/storage.js",
  "core/preview.js",
  "core/history.js",
  "core/diagnostics.js",
  "engines/vintage.js",
  "engines/halftone.js",
  "engines/halftone-tiled.js",
  "engines/cleanup.js",
  "engines/print.js",
  "engines/separation.js",
  "ai/analysis.js",
  "presets/index.js",
  "core/events.js",
  "core/init-guard.js",
];

/**
 * Loads FULL_LOAD_ORDER (optionally skipping one file, to simulate a load
 * failure) into a fresh, isolated vm context. Used only to verify
 * core/init-guard.js's assertReady() against the real files — isolated so it
 * can't affect any other test.
 */
export function loadFullAppIsolated(skipFile) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    parseFloat,
    parseInt,
    require: () => ({
      app: {},
      core: {},
      action: { batchPlay: async () => [] },
      imaging: {},
      storage: { localFileSystem: {} },
      entrypoints: { setup() {} },
    }),
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const rel of FULL_LOAD_ORDER) {
    if (rel === skipFile) continue;
    vm.runInContext(readRepoFile(rel), context, { filename: path.join(ROOT, rel) });
  }
  return context;
}
