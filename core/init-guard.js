/**
 * core/init-guard.js — initialization safety net for the classic-script global
 * architecture this plugin uses.
 *
 * WHY THIS EXISTS (and why it's not "import/export" instead):
 * Adobe's own UXP documentation is explicit that plugin-authored files don't support
 * standard ES `import`/`export` the way a bundled web app does — UXP's own mechanism
 * for including other files is its `require()` (CommonJS-style), and even that is
 * documented as "not as robust as some other include systems." Converting this
 * plugin's ~20 interdependent files (several of which — core/preview.js and
 * engines/halftone.js — depend on EACH OTHER, a genuine circular dependency) to a
 * require()-based module graph is a real, high-blast-radius rewrite of the entire
 * loading mechanism that cannot be verified without a live Photoshop/UXP host to test
 * against, which isn't available here. Rather than gamble a working, tested plugin on
 * an unverifiable platform-compatibility bet, this file implements the safer
 * fallback: a runtime assertion layer that fails LOUD, IMMEDIATELY, and CLEARLY the
 * moment a script fails to load or the load order in index.html changes — instead of
 * a confusing failure deep inside some unrelated feature much later.
 *
 * LOAD ORDER: this file only needs to load before ui/panels.js calls assertReady()
 * (which happens once, at the very start of init(), after every other script has
 * already executed) — see index.html.
 */

function PhotoneshopInitError(message) {
  this.name = "PhotoneshopInitError";
  this.message = message;
  this.stack = new Error().stack;
}
PhotoneshopInitError.prototype = Object.create(Error.prototype);
PhotoneshopInitError.prototype.constructor = PhotoneshopInitError;

window.PhotoneshopInit = (function () {
  // The load-bearing cross-file dependency graph — mirrors ARCHITECTURE.md.
  // Deliberately NOT exhaustive (100+ helper functions exist across this codebase);
  // this checks the foundational globals whose absence would silently break an
  // entire tab or feature, not every internal helper.
  var REQUIRED = {
    "core/memory.js": ["PhotoneshopMemory"],
    "core/errors.js": ["PhotoneshopErrors"],
    "core/validation.js": ["PhotoneshopValidation"],
    "core/benchmark.js": ["PhotoneshopBenchmark"],
    "core/api.js": [
      "guard",
      "hasDoc",
      "getDoc",
      "modal",
      "bp",
      "bpCreateLayer",
      "activeLayerId",
      "setStatus",
      "bind",
      "val",
      "num",
      "chk",
      "activeChip",
      "hexToRgb",
      "setSlider",
      "luminance",
      "selectOne",
      "suspendHistorySuspension",
      "resumeHistorySuspension",
    ],
    "core/storage.js": ["getUiState", "setUiState", "rememberFolder", "getRecentFolder"],
    "core/preview.js": [
      "schedulePreview",
      "cancelPreview",
      "applyResult",
      "isRenderStale",
      "bumpRenderGen",
      "waitForRenderLock",
      "historyActionName",
    ],
    "core/history.js": [
      "recordAction",
      "undoLast",
      "groupSelectedInto",
      "stampInGroup",
      "runNonDestructive",
      "resetAll",
      "samplePixelStats",
    ],
    "core/diagnostics.js": ["runDiagnostics"],
    "engines/vintage.js": ["buildPipeline", "autoDetectThreshold"],
    "engines/halftone.js": [
      "computeHalftoneBufferChunked",
      "readLayerPixels",
      "upscaleNearest",
      "writeHalftoneToLayer",
      "writeHalftoneFinal",
      "applyHalftoneEngine",
    ],
    "engines/cleanup.js": ["initCleanup"],
    "engines/print.js": [
      "applyGarment",
      "generateUnderbase",
      "shiftColors",
      "applyKnockout",
      "exportSpots",
      "applyDT",
      "setDTMode",
      "getDTMode",
      "exportScreen",
      "exportDTG",
      "exportDTF",
    ],
    "engines/separation.js": ["kMeansColors", "splitChannels", "recolorChannel", "autoSeparate", "rgbToCmyk"],
    "ai/analysis.js": ["runPrintDoctor", "runDeepAnalysis", "runProductionCheck"],
    "presets/index.js": ["loadPresets", "saveUserPreset", "saveLastUsed"],
    "core/events.js": ["initPhotoshopEventListeners"],
    // engines/halftone-tiled.js intentionally omitted — experimental/unwired by
    // design (see ARCHITECTURE.md), not a load-bearing dependency of anything.
  };

  function assertReady() {
    var missing = [];
    Object.keys(REQUIRED).forEach(function (file) {
      REQUIRED[file].forEach(function (name) {
        if (typeof window[name] === "undefined") {
          missing.push({ file: file, name: name });
        }
      });
    });
    // EDIT_PANES (core/preview.js) and SLIDER_DEFAULTS (core/history.js) are declared
    // with `let`, not `function`/`var` — like a real <script> tag, `let` at top level
    // never becomes a window property, only a shared-lexical-scope binding. A dynamic
    // window[name] lookup structurally cannot see them; a direct bare-identifier
    // reference can, because it resolves through that same shared lexical scope.
    if (typeof EDIT_PANES === "undefined") missing.push({ file: "core/preview.js", name: "EDIT_PANES" });
    if (typeof SLIDER_DEFAULTS === "undefined") missing.push({ file: "core/history.js", name: "SLIDER_DEFAULTS" });
    if (missing.length > 0) {
      var detail = missing
        .map(function (m) {
          return m.name + " (expected from " + m.file + ")";
        })
        .join(", ");
      throw new PhotoneshopInitError(
        "Photoneshop failed to initialize: " +
          missing.length +
          " expected component" +
          (missing.length === 1 ? "" : "s") +
          " did not load — " +
          detail +
          ". This usually means a script failed to load, or the load order in index.html " +
          "was changed. Try reloading the plugin (UXP Developer Tool \u2192 Unload \u2192 Load)."
      );
    }
  }

  return { assertReady: assertReady, REQUIRED: REQUIRED };
})();
