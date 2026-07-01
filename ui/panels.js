/**
 * ui/panels.js — UI wiring: tabs, sliders, chips, all button bindings
 * Loaded last; all engine functions already defined.
 */

function initTabs() {
  document.querySelectorAll(".nav button").forEach(function (t) {
    t.addEventListener("click", function (e) {
      let n = parseInt(e.currentTarget.dataset.tab, 10);
      clearPreviewTimer(); // FIX 2.2: Clear timer on tab switch to prevent accumulation
      _currentTab = n; // defined in core/preview.js
      document.querySelectorAll(".nav button").forEach(function (x) {
        x.classList.remove("on");
      });
      document.querySelectorAll(".pane").forEach(function (x) {
        x.classList.remove("on");
      });
      e.currentTarget.classList.add("on");
      let pane = document.getElementById("p" + n);
      if (pane) pane.classList.add("on");
      let bar = document.getElementById("applyBar");
      if (bar) bar.classList.toggle("hide", !EDIT_PANES[n]);
      let body = document.querySelector(".body");
      if (body) body.scrollTop = 0;
      // Cancel preview when leaving an edit pane
      if (!EDIT_PANES[n] && (_previewActive || _sourceReady)) cancelPreview();
    });
  });
  // Set initial apply bar state
  let bar = document.getElementById("applyBar");
  if (bar) bar.classList.toggle("hide", !EDIT_PANES[_currentTab]);
}

function initSliders() {
  let ALL_SLIDERS = [
    "thresh",
    "exposure",
    "highlight",
    "shadow",
    "bright",
    "contrast",
    "blur",
    "fade",
    "distress",
    "bleed",
    "grain",
    "lpi",
    "htAngle",
    "dotGain",
    "halftone",
    "wDensity",
    "wChoke",
    "wFeather",
    "wHl",
    "dtgInk",
    "dtgWhite",
    "dtgDetail",
    "dtfCol",
    "dtfInk",
    "dtfSharp",
    "sepChoke",
  ];
  // Sliders across all live-preview tabs (2,3,6,9,10 — see EDIT_PANES in core/preview.js).
  let LIVE_SLIDERS = [
    "thresh",
    "exposure",
    "highlight",
    "shadow",
    "bright",
    "contrast",
    "blur",
    "fade",
    "distress",
    "bleed",
    "grain",
    "lpi",
    "htAngle",
    "dotGain",
    "wDensity",
    "wChoke",
    "wFeather",
    "wHl",
    "dtgInk",
    "dtgWhite",
    "dtgDetail",
    "dtfCol",
    "dtfInk",
    "dtfSharp",
  ];

  ALL_SLIDERS.forEach(function (id) {
    let el = document.getElementById(id);
    let out = document.getElementById(id + "V");
    if (!el) return;
    fillSlider(el); // defined in core/api.js
    el.addEventListener("input", function () {
      if (out) out.textContent = el.value;
      fillSlider(el);
      if (LIVE_SLIDERS.indexOf(id) !== -1 && hasDoc() && EDIT_PANES[_currentTab]) {
        schedulePreview(); // defined in core/preview.js
      }
    });
  });

  let eff = document.getElementById("effect");
  if (eff)
    eff.addEventListener("change", function () {
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });

  let htColor = document.getElementById("htColor");
  if (htColor)
    htColor.addEventListener("input", function () {
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
}

function initChips() {
  [
    "#garmentChips",
    "#colorChips",
    "#htPattern",
    "#ditherChips",
    "#sepChips",
    "#sepColorChips",
    "#dtgChips",
    "#dtfChips",
    "#previewGarmentChips",
  ].forEach(function (sel) {
    document.querySelectorAll(sel + " button").forEach(function (c) {
      c.addEventListener("click", function (e) {
        document.querySelectorAll(sel + " button").forEach(function (x) {
          x.classList.remove("on");
        });
        e.currentTarget.classList.add("on");
      });
    });
  });
  // CMYK is always exactly 4 fixed channels — hide the colour-count picker for it.
  document.querySelectorAll("#sepChips button").forEach(function (b) {
    b.addEventListener("click", function () {
      let sec = document.getElementById("sepColorCountSec");
      if (sec) sec.style.display = b.dataset.sep === "cmyk" ? "none" : "";
    });
  });
}

function initLayerTarget() {
  document.querySelectorAll(".target-btn").forEach(function (b) {
    b.addEventListener("click", function (e) {
      document.querySelectorAll(".target-btn").forEach(function (x) {
        x.classList.remove("on");
      });
      e.currentTarget.classList.add("on");
      setLayerTarget(e.currentTarget.dataset.target); // defined in core/history.js
      setStatus("Target: " + e.currentTarget.textContent.trim(), "info");
    });
  });
}

function initModeToggle() {
  let sw = document.getElementById("modeToggle");
  bind("modeBasic", function () {
    document.getElementById("modeBasic").classList.add("on");
    document.getElementById("modeAdvanced").classList.remove("on");
    if (sw) sw.classList.remove("right");
    setStatus("Basic mode", "info");
  });
  bind("modeAdvanced", function () {
    document.getElementById("modeAdvanced").classList.add("on");
    document.getElementById("modeBasic").classList.remove("on");
    if (sw) sw.classList.add("right");
    setStatus("Advanced mode", "info");
  });
}

function initModal() {
  let overlay = document.getElementById("deepModal");
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeDeepModal(); // only close on backdrop click
    });
  }
}

// Shows a clear, plain-language failure screen if init-guard's assertReady() throws —
// a plugin that just doesn't respond to any clicks with no explanation is far worse
// than one that tells you plainly what went wrong.
function renderFatalInitError(e) {
  console.error("[Photoneshop init]", e);
  document.body.innerHTML =
    '<div style="padding:20px;font-family:sans-serif;color:#f0f0f0;background:#3a1414;' +
    'height:100vh;box-sizing:border-box;overflow:auto;">' +
    '<h2 style="margin-top:0;color:#ff6b6b;">Photoneshop failed to start</h2>' +
    '<p style="line-height:1.5;">' +
    (e && e.message ? String(e.message) : String(e)) +
    "</p>" +
    "</div>";
}

async function init() {
  try {
    window.PhotoneshopInit.assertReady();
  } catch (e) {
    renderFatalInitError(e);
    return; // stop here — do not wire up UI against missing dependencies
  }

  initTabs();
  initSliders();
  initChips();
  initLayerTarget();
  initModeToggle();
  initModal();

  // Print Doctor (tab 1)
  bind("runDoctor", runPrintDoctor); // ai/analysis.js
  bind("runProduction", runProductionCheck); // ai/analysis.js
  bind("runDeep", runDeepAnalysis); // ai/analysis.js
  bind("deepClose", closeDeepModal); // ai/analysis.js
  bind("fixUpscale", fixUpscale); // ai/analysis.js
  bind("fixResize", fixResize); // ai/analysis.js
  bind("fixEnhance", fixEnhance); // ai/analysis.js
  bind("fixFlatten", fixFlatten); // ai/analysis.js
  bind("toggleRGB", function () {
    setColourMode("RGB");
  }); // ai/analysis.js
  bind("toggleCMYK", function () {
    setColourMode("CMYK");
  }); // ai/analysis.js
  updateFixAvailability(); // ai/analysis.js — set initial button state

  // Design Studio (tab 2) — auto-start preview on first slider interaction via initSliders
  bind("autoAnalyse", autoDetectThreshold); // engines/vintage.js
  bind("applyVintage", applyResult); // core/preview.js
  bind("resetAll", resetAll); // core/history.js

  // Halftone (tab 3)
  bind("applyHalftone", applyHalftoneEngine); // engines/halftone.js

  // Cleanup (tab 7) — initCleanup registers all 6 buttons
  initCleanup(); // engines/cleanup.js

  // Garment (tab 8)
  bind("applyGarment", applyGarment); // engines/print.js

  // Colours (tab 4)
  bind("reduceColors", splitChannels); // engines/separation.js — real per-colour layers
  bind("exportSpots", exportSpots); // engines/print.js

  // Separation (tab 5)
  bind("autoSeparate", autoSeparate); // engines/separation.js — full CMYK/spot/sim-process auto pipeline
  bind("shiftColors", shiftColors); // engines/print.js
  bind("applyKnockout", applyKnockout); // engines/print.js

  // White Ink (tab 6)
  bind("generateUnderbase", generateUnderbase); // engines/print.js

  // DTG (tab 9)
  bind("applyDTG", applyDTG); // engines/print.js

  // DTF (tab 10)
  bind("applyDTF", applyDTF); // engines/print.js

  // Export (tab 13)
  bind("exportScreen", exportScreen); // engines/print.js
  bind("exportDTG", exportDTG); // engines/print.js
  bind("exportDTF", exportDTF); // engines/print.js

  // Presets (tab 14) — all defined in presets/index.js
  bind("saveUserPreset", saveUserPreset);
  initBuiltinCategoryChips();
  await loadPresets();

  // Footer tools
  bind("undoLast", undoLast); // core/history.js
  bind("runDiagnostics", runDiagnostics); // core/diagnostics.js
  bind("soloGroup", toggleSolo); // core/history.js

  setStatus("Photoneshop ready", "success");
}

// Use a Promise-based runner to handle async init cleanly
(function run() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init().catch(function (e) {
        console.error("Photoneshop init error:", e);
      });
    });
  } else {
    init().catch(function (e) {
      console.error("Photoneshop init error:", e);
    });
  }
})();
