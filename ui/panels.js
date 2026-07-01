/**
 * ui/panels.js — UI wiring: tabs, sliders, chips, all button bindings
 * Loaded last; all engine functions already defined.
 */

// sp-tabs owns its own single-selection state (the "selected" attribute on
// the <sp-tabs> container itself, not a per-tab class) — unlike the chip
// groups, this is not a selectOne() case. Content panes stay plain divs
// shown/hidden by class, exactly as before.
function initTabs() {
  let tabs = document.getElementById("navTabs");
  if (tabs) {
    tabs.addEventListener("change", function () {
      let n = parseInt(tabs.selected, 10);
      if (!n) return;
      clearPreviewTimer(); // FIX 2.2: Clear timer on tab switch to prevent accumulation
      _currentTab = n; // defined in core/preview.js
      document.querySelectorAll(".pane").forEach(function (x) {
        x.classList.remove("on");
      });
      let pane = document.getElementById("p" + n);
      if (pane) pane.classList.add("on");
      let bar = document.getElementById("applyBar");
      if (bar) bar.classList.toggle("hide", !EDIT_PANES[n]);
      let body = document.querySelector(".body");
      if (body) body.scrollTop = 0;
      // Cancel preview when leaving an edit pane
      if (!EDIT_PANES[n] && (_previewActive || _sourceReady)) cancelPreview();
    });
  }
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
    "htSize",
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
  // Sliders across all live-preview tabs (2,3,6,9 — see EDIT_PANES in core/preview.js).
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
    "htSize",
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
    if (out) out.textContent = el.value; // sync label to sp-slider's initial value
    el.addEventListener("input", function () {
      if (out) out.textContent = el.value;
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
    "#sepChips",
    "#sepColorChips",
    "#dtgChips",
    "#dtfChips",
    "#previewGarmentChips",
  ].forEach(function (sel) {
    document.querySelectorAll(sel + " sp-action-button").forEach(function (c) {
      c.addEventListener("click", function (e) {
        selectOne(sel + " sp-action-button", e.currentTarget); // core/api.js
      });
    });
  });
  // CMYK is always exactly 4 fixed channels — hide the colour-count picker for it.
  document.querySelectorAll("#sepChips sp-action-button").forEach(function (b) {
    b.addEventListener("click", function () {
      let sec = document.getElementById("sepColorCountSec");
      if (sec) sec.style.display = b.dataset.sep === "cmyk" ? "none" : "";
    });
  });
}

function initLayerTarget() {
  document.querySelectorAll(".target-strip sp-action-button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      selectOne(".target-strip sp-action-button", e.currentTarget); // core/api.js
      setLayerTarget(e.currentTarget.dataset.target); // defined in core/history.js
      setStatus("Target: " + e.currentTarget.textContent.trim(), "info");
    });
  });
}

// DT Studio (tab 9) — DTG/DTF sub-mode switch (shows/hides each mode's own
// section) plus the halftone-screen checkbox, which just needs to trigger a
// live-preview refresh when toggled (its value is read directly via chk("dtHalftone")
// everywhere else).
function initDTStudio() {
  document.querySelectorAll("#dtModeChips sp-action-button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      selectOne("#dtModeChips sp-action-button", e.currentTarget); // core/api.js
      let mode = e.currentTarget.dataset.dtmode;
      setDTMode(mode); // engines/print.js
      document.querySelectorAll(".dt-dtg-only").forEach(function (el) {
        el.classList.toggle("hide", mode === "dtf");
      });
      document.querySelectorAll(".dt-dtf-only").forEach(function (el) {
        el.classList.toggle("hide", mode !== "dtf");
      });
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
  });
  let halftoneChk = document.getElementById("dtHalftone");
  if (halftoneChk) {
    halftoneChk.addEventListener("change", function () {
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
  }
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
  initDTStudio();
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

  // Screen Studio (tab 5) — channel separation + simultaneous per-channel halftone
  bind("autoSeparate", autoSeparate); // engines/separation.js — full CMYK/spot/sim-process auto pipeline
  bind("shiftColors", shiftColors); // engines/print.js
  bind("applyKnockout", applyKnockout); // engines/print.js

  // White Ink (tab 6)
  bind("generateUnderbase", generateUnderbase); // engines/print.js

  // DT Studio (tab 9) — DTG + DTF + optional halftone screen
  bind("applyDT", applyDT); // engines/print.js

  // Export (tab 12)
  bind("exportScreen", exportScreen); // engines/print.js
  bind("exportDTG", exportDTG); // engines/print.js
  bind("exportDTF", exportDTF); // engines/print.js

  // Presets (tab 13) — all defined in presets/index.js
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
