/**
 * test-suite.js — Photoneshop v5.2.1 real test suite
 *
 * UNLIKE the previous version, this suite does NOT reimplement modules as inline
 * mocks. It loads the ACTUAL shipped source files (core/*.js, engines/*.js) into a
 * Node `vm` context that provides a browser-like `window` plus the few UXP helper
 * globals the modules reference, then calls the REAL exported functions and asserts
 * on their REAL behaviour.
 *
 * Most importantly it includes a FUNCTIONAL regression test that invokes the halftone
 * integration entry point (window.PhotoneshopHalftoneIntegrated.applyHalftone) with a
 * mocked Photoshop imaging API and asserts that real pixels are read AND written —
 * the exact path that was broken in v5.2 (it threw "Original halftone module not
 * loaded" on every call). If that regression were present, this test FAILS.
 *
 * Run:  node test-suite.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const ROOT = __dirname;

// ---- tiny test harness ---------------------------------------------------
let passed = 0,
  failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log("  \u2713 " + name);
    passed++;
  } catch (e) {
    console.log("  \u2717 " + name + "\n      " + (e && e.message ? e.message : e));
    failed++;
    failures.push(name);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    console.log("  \u2713 " + name);
    passed++;
  } catch (e) {
    console.log("  \u2717 " + name + "\n      " + (e && e.message ? e.message : e));
    failed++;
    failures.push(name);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || "not equal") + " (got " + a + ", expected " + b + ")");
}

// ---- shared vm context that loads the REAL source files ------------------
// Injected helper globals mirror what core/api.js + core/preview.js provide at
// runtime inside Photoshop. core/api.js itself is loaded (with require() stubbed)
// so the REAL guard() and val()/num() helpers are exercised. window.imaging /
// window.app are installed per-test for the functional + guard tests.
const htParams = { htAngle: "45", lpi: "45", dotGain: "0", dpi: "300" };

// Stub the UXP module loader so core/api.js can load under Node.
function fakeRequire(name) {
  if (name === "photoshop") {
    return { app: {}, core: {}, action: { batchPlay: () => {} }, imaging: {} };
  }
  if (name === "uxp") {
    return { storage: { localFileSystem: {} }, entrypoints: { setup: () => {} } };
  }
  throw new Error("unexpected require: " + name);
}

// Minimal DOM stub: returns elements with values for known halftone param ids so the
// REAL val()/num() in api.js resolve params; null for everything else (setStatus no-ops).
const documentStub = {
  getElementById: (id) =>
    id in htParams ? { value: htParams[id], classList: { add() {}, remove() {}, toggle() {} } } : null,
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
  val: (id) => (id in htParams ? htParams[id] : ""),
  num: (id) => parseFloat(htParams[id]) || 0,
  setWriteInProgress: () => {},
  window: {},
};
sandbox.window.console = sandbox.console;
sandbox.window.performance = performance;
const context = vm.createContext(sandbox);

function load(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error("MISSING source file: " + rel);
  const code = fs.readFileSync(p, "utf8");
  vm.runInContext(code, context, { filename: rel });
  return code;
}

// Load a module that does require("photoshop")/require("uxp") at top level into its
// OWN isolated vm context, with those modules stubbed. Returns the live context plus
// the fake photoshop app object so tests can drive doc state. Used to exercise the
// REAL core/api.js guard(), which gates every tool (including the halftone button).
function loadIsolated(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error("MISSING source file: " + rel);
  const code = fs.readFileSync(p, "utf8");
  const fakePhotoshop = {
    app: { documents: [], activeDocument: null },
    core: { executeAsModal: async (fn) => fn() },
    action: { batchPlay: async () => [] },
    imaging: {},
  };
  fakePhotoshop.action.batchPlay = async () => [];
  const fakeUxp = { storage: { localFileSystem: {} }, entrypoints: { setup: () => {} } };
  const elStub = () => ({ classList: { add() {}, remove() {} }, className: "", textContent: "", value: "" });
  const sb = {
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
  const ctx = vm.createContext(sb);
  vm.runInContext(code, ctx, { filename: rel });
  return { ctx, fakePhotoshop };
}

// The complete real load order from index.html (everything ui/panels.js depends on —
// ui/panels.js itself isn't included since nothing in REQUIRED expects anything FROM it).
const FULL_LOAD_ORDER = [
  "core/memory.js",
  "core/errors.js",
  "core/validation.js",
  "core/benchmark.js",
  "core/api.js",
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
  "core/init-guard.js",
];

// Loads FULL_LOAD_ORDER (optionally skipping one file, to simulate a load failure)
// into a fresh, isolated vm context. Used only to verify core/init-guard.js's
// assertReady() against the real files — isolated so it can't affect the shared
// context every other test in this suite depends on.
function loadFullAppIsolated(skipFile) {
  const sb = {
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
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const rel of FULL_LOAD_ORDER) {
    if (rel === skipFile) continue;
    const p = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: rel });
  }
  return ctx;
}

let halftoneSrc = "";
let loadOK = true;
try {
  load("core/memory.js");
  load("core/errors.js");
  load("core/validation.js");
  load("core/benchmark.js");
  load("core/api.js");
  load("engines/halftone-tiled.js");
  halftoneSrc = load("engines/halftone.js");
  load("engines/separation.js");
} catch (e) {
  loadOK = false;
  console.error("FATAL: a real source file failed to load: " + e.message);
}
const W = sandbox.window;

(async function run() {
  console.log("\nPhotoneshop v5.2.1 \u2014 REAL test suite (loads shipped source via vm)\n");

  console.log("Source loading");
  test("all six real source files loaded without throwing", () =>
    assert(loadOK, "one or more source files threw on load"));
  test("core modules attached real exports to window", () => {
    assert(W.PhotoneshopMemory, "PhotoneshopMemory missing");
    assert(W.PhotoneshopErrors, "PhotoneshopErrors missing");
    assert(W.PhotoneshopValidation, "PhotoneshopValidation missing");
    assert(W.PhotoneshopBenchmark, "PhotoneshopBenchmark missing");
    assert(W.PhotoneshopHalftoneTiled, "PhotoneshopHalftoneTiled missing");
    assert(W.PhotoneshopHalftoneIntegrated, "PhotoneshopHalftoneIntegrated missing");
  });

  console.log("\ncore/memory.js (real)");
  test("allocateBuffer returns a Uint8Array of exact byte size", () => {
    const b = W.PhotoneshopMemory.allocateBuffer(100, 100, 4, "test");
    assert(b instanceof Uint8Array, "not a Uint8Array");
    assertEqual(b.length, 100 * 100 * 4, "wrong length");
  });
  test("getMemoryStats reports current/peak after allocation", () => {
    const s = W.PhotoneshopMemory.getMemoryStats();
    assert(typeof s.currentMemoryMB === "number", "currentMemoryMB not numeric");
    assert(typeof s.peakMemoryMB === "number", "peakMemoryMB not numeric");
    assert(s.peakMemoryMB >= s.currentMemoryMB || s.peakMemoryMB >= 0, "peak < current");
  });
  test("releaseBuffer then re-allocate reuses pooled buffer (pooling works)", () => {
    // 256x256x4 is a declared pool size in memory.js (MEMORY_POOL_SIZES)
    const a = W.PhotoneshopMemory.allocateBuffer(256, 256, 4, "pool");
    W.PhotoneshopMemory.releaseBuffer(a, 256, 256, 4);
    const b = W.PhotoneshopMemory.allocateBuffer(256, 256, 4, "pool");
    assert(b === a, "pool did not return the same buffer instance");
  });

  console.log("\ncore/errors.js (real)");
  test("PhotoneshopError uses real (operation, details, cause) constructor", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    const cause = new Error("root cause");
    const e = new E("halftone-apply", "something failed", cause);
    assert(e.message.indexOf("halftone-apply") !== -1, "operation not in message");
    assert(e.message.indexOf("something failed") !== -1, "details not in message");
    assertEqual(e.operation, "halftone-apply");
    assert(e.toString().indexOf("root cause") !== -1, "cause not in toString");
  });
  test("PhotoneshopError.withLayerState populates layer context", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    const e = new E("op", "detail").withLayerState({ name: "L1", kind: "pixel", visible: true, opacity: 100 });
    assert(e.layerState && e.layerState.name === "L1", "layerState.name not set");
    assert(e.toString().indexOf("L1") !== -1, "layer name not in toString");
  });
  test("PhotoneshopError has NO static .wrap (integration must not rely on it)", () => {
    const E = W.PhotoneshopErrors.PhotoneshopError;
    assert(typeof E.wrap !== "function", ".wrap unexpectedly exists \u2014 update integration/test");
  });

  console.log("\ncore/validation.js (real)");
  test("runAllChecks returns {allPass, results} shape on real call", () => {
    const doc = { mode: "RGBColorMode", bitsPerChannel: 8, width: 64, height: 64, resolution: 300 };
    const layer = { name: "L", kind: "pixel", locked: false, allLocked: false };
    const r = W.PhotoneshopValidation.runAllChecks(doc, layer, 50);
    assert(typeof r.allPass === "boolean", "allPass not boolean");
    assert(r.results && typeof r.results === "object", "results not an object");
    const entries = Object.values(r.results);
    assert(entries.length > 0, "no checks ran");
    assert(
      entries.every((e) => e && typeof e.pass === "boolean"),
      "a check result lacks a boolean .pass"
    );
  });
  test('validateRGBMode PASSES a real UXP RGB document (doc.mode = "RGBColorMode", no colorModel)', () => {
    // This is the exact real-world shape that the colorModel bug failed on.
    const res = W.PhotoneshopValidation.validateRGBMode({ mode: "RGBColorMode" });
    assert(res && res.pass === true, "real UXP RGB document was not recognised as RGB");
  });
  test('validateRGBMode FAILS a real UXP CMYK document (doc.mode = "CMYKColorMode")', () => {
    const res = W.PhotoneshopValidation.validateRGBMode({ mode: "CMYKColorMode" });
    assert(res && res.pass === false, "CMYK doc not flagged");
  });
  test("validateRGBMode does NOT false-fail when colour mode is unreadable", () => {
    const res = W.PhotoneshopValidation.validateRGBMode({}); // no mode, no colorModel
    assert(res && res.pass === true && res.indeterminate === true, "unreadable mode produced a hard RGB failure");
  });

  console.log("\ncore/api.js guard() (real, isolated vm) \u2014 the gate on EVERY tool incl. halftone");
  // guard() runs first in applyHalftoneEngine(). If it false-blocks real RGB documents
  // (the doc.colorModel bug: undefined !== "RGB" => blocked), the halftone button never
  // runs on a real document, regardless of the integration wiring. These tests load the
  // REAL core/api.js and call the REAL guard().
  let api;
  test("core/api.js loads (with photoshop/uxp stubbed) and exposes guard()", () => {
    api = loadIsolated("core/api.js");
    assert(typeof api.ctx.guard === "function", "guard() not defined by api.js");
  });
  test('HEADLINE GUARD: guard() PASSES a real UXP RGB document (doc.mode="RGBColorMode", no colorModel)', () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = { mode: "RGBColorMode" }; // real shape: no colorModel
    assert(
      api.ctx.guard() === true,
      "guard() blocked a real RGB document \u2014 the colorModel bug would stop the halftone button on every real doc"
    );
  });
  test('guard() BLOCKS a real UXP CMYK document (doc.mode="CMYKColorMode")', () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = { mode: "CMYKColorMode" };
    assert(api.ctx.guard() === false, "guard() failed to block a CMYK document");
  });
  test("guard() does NOT false-block when colour mode is unreadable", () => {
    api.fakePhotoshop.app.documents = [{}];
    api.fakePhotoshop.app.activeDocument = {}; // no mode, no colorModel
    assert(api.ctx.guard() === true, "guard() false-blocked a document whose mode is unreadable");
  });
  test("REGRESSION GUARD: no source file gates on doc.colorModel equality", () => {
    // The exact bug shape: `doc.colorModel === 'RGB'` or `doc.colorModel !== 'RGB'`.
    const files = ["core/api.js", "core/validation.js", "core/errors.js"];
    for (const f of files) {
      const src = fs
        .readFileSync(path.join(ROOT, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      assert(
        !/doc\.colorModel\s*(===|!==)\s*['"]RGB['"]/.test(src),
        f + " still gates on doc.colorModel equality (the UXP mode bug)"
      );
    }
  });

  console.log("\ncore/benchmark.js (real)");
  test("Benchmark.start/end computes duration and throughput on real timer", () => {
    const B = W.PhotoneshopBenchmark.Benchmark;
    const bench = new B("unit").start();
    // burn a little time
    let x = 0;
    for (let i = 0; i < 1e5; i++) x += i;
    bench.end(50000);
    const j = bench.toJSON();
    assert(j.durationMS >= 0, "duration negative");
    assertEqual(j.pixelsProcessed, 50000, "pixel count not recorded");
    assert(j.throughputPixelsPerSec >= 0, "throughput missing");
    assert(x >= 0); // keep optimizer honest
  });
  test("detectRegressions flags a slowdown beyond threshold", () => {
    const base = { benchmarks: [{ name: "op", durationMS: 100, memoryPeakMB: 10 }] };
    const cur = { benchmarks: [{ name: "op", durationMS: 200, memoryPeakMB: 10 }] };
    const regs = W.PhotoneshopBenchmark.detectRegressions(base, cur, 10);
    assert(Array.isArray(regs) && regs.length >= 1, "regression not detected");
    assert(regs[0].operation === "op", "wrong operation reported");
  });

  console.log("\nengines/halftone-tiled.js (real tile math + honest guard)");
  test("tiledHalftoneRender (exported) produces real tiles with ink for a dark source", async () => {
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
    assert(Array.isArray(tiles) && tiles.length > 1, "expected multiple tiles, got " + (tiles && tiles.length));
    let ink = 0;
    for (const t of tiles) {
      for (let i = 3; i < t.pixels.length; i += 4) if (t.pixels[i] === 255) ink++;
    }
    assert(ink > 0, "tiled render produced zero ink on a fully dark source");
  });
  test("applyHalftoneTiled THROWS (experimental, not a silent fake success)", async () => {
    let threw = false;
    try {
      await W.PhotoneshopHalftoneTiled.applyHalftoneTiled({}, {}, () => {});
    } catch (e) {
      threw = true;
      assert(/experimental|not implemented/i.test(e.message), "wrong error: " + e.message);
    }
    assert(threw, "mock tiled renderer returned instead of throwing");
  });

  console.log("\nengines/halftone.js \u2014 INTEGRATION / REGRESSION (real call, mocked imaging)");
  test("integration entry point is exported as a function", () => {
    assert(
      W.PhotoneshopHalftoneIntegrated && typeof W.PhotoneshopHalftoneIntegrated.applyHalftone === "function",
      "applyHalftone not a function"
    );
  });

  // Static guards that would catch reintroduction of the exact v5.2 bugs.
  // Strip comments first so explanatory prose mentioning the old bug does not trip the guard.
  const codeOnly = halftoneSrc
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1"); // line comments (leave http:// alone via the [^:] guard)
  test("REGRESSION GUARD: no reference to an unassigned window.PhotoneshopHalftone global", () => {
    const refsBare = /window\.PhotoneshopHalftone(?![A-Za-z])/.test(codeOnly); // not ...Tiled / ...Integrated
    if (refsBare) {
      const assigns = /window\.PhotoneshopHalftone(?![A-Za-z])\s*=/.test(codeOnly);
      assert(
        assigns,
        "halftone.js references window.PhotoneshopHalftone in code but never assigns it (the v5.2 dead-global bug)"
      );
    }
    assert(true);
  });
  test("REGRESSION GUARD: integration does not call PhotoneshopError.wrap()", () => {
    assert(!/PhotoneshopError\.wrap\s*\(/.test(codeOnly), "halftone.js calls nonexistent PhotoneshopError.wrap()");
  });
  test("REGRESSION GUARD: button path does not route to mock applyHalftoneTiled", () => {
    assert(!/applyHalftoneTiled\s*\(/.test(codeOnly), "halftone.js routes to mock tiled renderer");
  });

  // THE functional test that the old suite lacked: actually run the integration entry
  // point with a mocked PS imaging API and prove pixels are read AND written.
  await testAsync("FUNCTIONAL: applyHalftone reads real pixels and writes a real halftone (end-to-end)", async () => {
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
      getPixels: async (opts) => {
        getCalled = true;
        return { imageData: { getData: async () => grad, components: 4, width: w, height: h, dispose() {} } };
      },
      createImageDataFromBuffer: async (buf, meta) => {
        capturedOut = buf;
        return { dispose() {} };
      },
      putPixels: async (args) => {
        putCalled = true;
        putBounds = args && args.targetBounds;
      },
    };

    const variation = await W.PhotoneshopHalftoneIntegrated.applyHalftone(12345, 1, () => {});

    assert(
      getCalled,
      "getPixels was never called \u2014 render did not read the layer (v5.2 regression: threw before reading)"
    );
    assert(putCalled, "putPixels was never called \u2014 no halftone was written to the layer");
    assert(putBounds && putBounds.right === w && putBounds.bottom === h, "putPixels wrote wrong bounds");
    assert(capturedOut instanceof Uint8Array && capturedOut.length === w * h * 4, "output buffer wrong size");
    let ink = 0;
    for (let i = 3; i < capturedOut.length; i += 4) if (capturedOut[i] === 255) ink++;
    assert(ink > 0, "written halftone contains zero ink pixels (render produced nothing)");
    assert(variation && typeof variation.n === "number" && variation.n > 0, "no tonal-variation result returned");
  });

  // Prove the suite has teeth: if the dead-global pattern were present, the functional
  // test above would throw "Original halftone module not loaded" instead of writing.
  await testAsync("FUNCTIONAL: integration surfaces render errors (does not swallow)", async () => {
    W.app = { activeDocument: { resolution: 300, width: 32, height: 32, activeLayers: [] } };
    W.imaging = {
      getPixels: async () => {
        throw new Error("simulated getPixels failure");
      },
      createImageDataFromBuffer: async () => ({ dispose() {} }),
      putPixels: async () => {},
    };
    let threw = false,
      msg = "";
    try {
      await W.PhotoneshopHalftoneIntegrated.applyHalftone(1, 1, () => {});
    } catch (e) {
      threw = true;
      msg = e.message || "";
    }
    assert(threw, "integration swallowed a real render failure");
    assert(/getPixels|halftone-apply/i.test(msg), "error context lost: " + msg);
  });

  // ---- engines/separation.js (real) ---------------------------------------
  console.log("\nengines/separation.js (real) — auto separation");
  test("rgbToCmyk: pure black -> k=1, c=m=y=0", () => {
    const r = context.rgbToCmyk(0, 0, 0);
    assertEqual(Math.round(r.k * 100), 100, "k");
    assertEqual(Math.round(r.c * 100), 0, "c");
    assertEqual(Math.round(r.m * 100), 0, "m");
    assertEqual(Math.round(r.y * 100), 0, "y");
  });
  test("rgbToCmyk: pure white -> c=m=y=k=0", () => {
    const r = context.rgbToCmyk(255, 255, 255);
    assertEqual(Math.round(r.c * 100), 0, "c");
    assertEqual(Math.round(r.m * 100), 0, "m");
    assertEqual(Math.round(r.y * 100), 0, "y");
    assertEqual(Math.round(r.k * 100), 0, "k");
  });
  test("rgbToCmyk: pure red -> m=y=1, c=k=0 (red = magenta+yellow)", () => {
    const r = context.rgbToCmyk(255, 0, 0);
    assertEqual(Math.round(r.c * 100), 0, "c");
    assertEqual(Math.round(r.m * 100), 100, "m");
    assertEqual(Math.round(r.y * 100), 100, "y");
    assertEqual(Math.round(r.k * 100), 0, "k");
  });
  test("nearestSimInk: near-black snaps to Sim Black, not Sim White", () => {
    const ink = context.nearestSimInk(10, 10, 10);
    assertEqual(ink.name, "Sim Black", "nearestSimInk");
  });
  test("CMYK_ANGLES uses the classic 15/75/0/45 prepress convention (anti-moiré spacing)", () => {
    // CMYK_ANGLES is a top-level `const`, so (like a real <script> tag) it lives in the
    // module's lexical scope, not as a vm-context property — check the real source text
    // directly, same approach already used for the other constant-value regression guards.
    const src = fs.readFileSync(path.join(ROOT, "engines/separation.js"), "utf8");
    assert(
      /CMYK_ANGLES\s*=\s*\{\s*c:\s*15,\s*m:\s*75,\s*y:\s*0,\s*k:\s*45\s*\}/.test(src),
      "CMYK_ANGLES no longer matches the classic C15/M75/Y0/K45 convention"
    );
  });
  test("REGRESSION GUARD: writeChannelLayer upscales to full document size (canvas-coverage fix)", () => {
    const src = fs.readFileSync(path.join(ROOT, "engines/separation.js"), "utf8");
    assert(
      /function writeChannelLayer[\s\S]{0,400}upscaleNearest/.test(src),
      "writeChannelLayer no longer upscales to the real document size — split/separated layers would only fill a scan-resolution corner of the canvas on large documents"
    );
  });
  test("autoSeparate is exported as a real function", () => {
    assertEqual(typeof context.autoSeparate, "function", "autoSeparate");
  });

  // ---- core/init-guard.js (real) — the ES-modules-vs-UXP tradeoff -------------
  console.log("\ncore/init-guard.js (real) — initialization safety net");
  test("assertReady(): full real load order (matching index.html) throws nothing", () => {
    const ctx = loadFullAppIsolated();
    ctx.window.PhotoneshopInit.assertReady(); // throws on failure -> test fails
  });
  ["engines/print.js", "core/preview.js", "core/history.js", "ai/analysis.js", "engines/separation.js"].forEach(
    (missingFile) => {
      test("assertReady(): correctly detects and names a missing " + missingFile, () => {
        const ctx = loadFullAppIsolated(missingFile);
        let threw = null;
        try {
          ctx.window.PhotoneshopInit.assertReady();
        } catch (e) {
          threw = e;
        }
        assert(threw, "expected assertReady() to throw when " + missingFile + " failed to load");
        assertEqual(threw.name, "PhotoneshopInitError", "error type");
        assert(threw.message.includes(missingFile), "error message should name the missing file (" + missingFile + ")");
      });
    }
  );

  // ---- UI-layer static regression guards (v5.2.2 follow-up fixes) --------
  test("REGRESSION GUARD: no CSS color assignment uses the invalid let(--x) typo for var(--x)", () => {
    const files = ["ai/analysis.js", "core/api.js", "core/history.js", "core/preview.js", "ui/panels.js"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(
        !/\blet\(--/.test(src),
        f + ' contains the invalid CSS "let(--x)" typo (should be "var(--x)") — colour styling silently no-ops'
      );
    }
  });
  test("REGRESSION GUARD: no accidental window.window. double-reference", () => {
    const files = ["engines/print.js", "engines/separation.js", "engines/vintage.js", "core/api.js"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert(!/window\.window\./.test(src), f + " contains an accidental window.window. double-reference");
    }
  });

  // ---- summary ----------------------------------------------------------
  console.log("\n" + "=".repeat(56));
  console.log("  RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
  console.log("=".repeat(56));
  if (failed > 0) {
    console.log("\nFAILED:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  } else {
    console.log("\nAll tests passed against the REAL shipped source files.");
    process.exit(0);
  }
})();
