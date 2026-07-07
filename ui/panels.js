/**
 * ui/panels.js — UI wiring: tabs, sliders, chips, all button bindings
 * Loaded last; all engine functions already defined.
 */

// Workflow navigation — which panes belong to which stage chip. Tier 1 is
// the print-workflow stage, tier 2 the tool within it; each tool maps to one
// of the same pane numbers (p1–p14) the plugin has always used, so
// EDIT_PANES, live-preview lifecycle, and the saved lastTab all keep their
// existing meaning. (Replaces sp-tabs, which is not a built-in UXP widget —
// it rendered as a dead, unclickable list of labels in a real panel.)
const NAV_STAGE_OF_PANE = {
  1: 0,
  7: 0,
  11: 0, // Check: Print Doctor, Cleanup, Production
  2: 1,
  3: 1,
  4: 1, // Design: Design Studio, Halftone, Colours
  5: 2,
  6: 2, // Screens: Separate, White Ink
  9: 3,
  8: 3,
  10: 3, // Print: DTG/DTF, Garment, Preview
  12: 4,
  13: 4,
  14: 4, // Output: Export, Presets, Diagnostics
};

// Switches to pane n and syncs both nav tiers to match — the single place
// that knows how to activate a tool, shared by stage clicks, tool clicks,
// and startup restore of the last-active tool (core/storage.js).
function activateTab(n) {
  clearPreviewTimer(); // don't leave a debounced tick scheduled against the pane being left
  _currentTab = n; // defined in core/preview.js
  document.querySelectorAll(".pane").forEach(function (x) {
    x.classList.remove("on");
  });
  let pane = document.getElementById("p" + n);
  if (pane) pane.classList.add("on");

  // Sync nav chips: select the owning stage, show its tool row, select the tool.
  let stage = NAV_STAGE_OF_PANE[n];
  if (stage !== undefined) {
    let stageBtn = document.querySelector('#navStages sp-action-button[data-stage="' + stage + '"]');
    if (stageBtn) selectOne("#navStages sp-action-button", stageBtn);
    document.querySelectorAll(".nav-tools").forEach(function (row) {
      row.classList.toggle("on", row.id === "stageTools" + stage);
    });
    let toolBtn = document.querySelector("#stageTools" + stage + ' sp-action-button[data-pane="' + n + '"]');
    if (toolBtn) selectOne("#stageTools" + stage + " sp-action-button", toolBtn);
  }

  let bar = document.getElementById("applyBar");
  if (bar) bar.classList.toggle("hide", !EDIT_PANES[n]);
  let body = document.querySelector(".body");
  if (body) body.scrollTop = 0;
  setUiState("lastTab", n); // core/storage.js
}

// Activating any pane cancels a live-preview session left open on an edit
// pane being navigated away from — same rule the old tab handler enforced.
function navigateToPane(n) {
  activateTab(n);
  if (!EDIT_PANES[n] && (_previewActive || _sourceReady)) cancelPreview();
}

function initNav() {
  // Stage chip → jump to whichever tool is already selected in that stage's
  // row (its first tool on a fresh panel), so re-entering a stage returns to
  // where the user left it within that stage.
  document.querySelectorAll("#navStages sp-action-button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      let stage = e.currentTarget.dataset.stage;
      let row = document.getElementById("stageTools" + stage);
      if (!row) return;
      let tool = row.querySelector("sp-action-button[selected]") || row.querySelector("sp-action-button");
      if (tool) navigateToPane(parseInt(tool.dataset.pane, 10));
    });
  });
  // Tool chip → its pane.
  document.querySelectorAll(".nav-tools sp-action-button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      navigateToPane(parseInt(e.currentTarget.dataset.pane, 10));
    });
  });
  // Restore the last active tool, if one was ever saved (core/storage.js).
  // No saved value yet (first run, or before this feature existed) leaves
  // the hard-coded startup pane untouched.
  let lastTab = getUiState("lastTab", null);
  if (lastTab != null && document.getElementById("p" + lastTab)) {
    activateTab(parseInt(lastTab, 10));
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
  // A Set so the "input" handler below (which can fire many times a second
  // while dragging) checks membership in O(1) instead of scanning an array.
  let LIVE_SLIDERS = new Set([
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
  ]);

  ALL_SLIDERS.forEach(function (id) {
    let el = document.getElementById(id);
    let out = document.getElementById(id + "V");
    if (!el) return;
    if (out) out.textContent = el.value; // sync label to sp-slider's initial value
    el.addEventListener("input", function () {
      if (out) out.textContent = el.value;
      if (LIVE_SLIDERS.has(id) && hasDoc() && EDIT_PANES[_currentTab]) {
        schedulePreview(); // defined in core/preview.js
      }
    });
  });

  let eff = document.getElementById("effect");
  if (eff)
    eff.addEventListener("change", function () {
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });

  initInkPicker();
}

// Halftone ink colour — preset swatches + hex textfield (UXP has no
// <input type="color">; the old native picker rendered as a dead square).
// The textfield keeps the id "htColor" so every existing val("htColor") →
// hexToRgb() read across the engines works unchanged.
function initInkPicker() {
  let field = document.getElementById("htColor");
  let dot = document.getElementById("htColorDot");
  function syncDot() {
    if (!dot || !field) return;
    let rgb = hexToRgb(field.value); // tolerates partial/bad input (falls back to black)
    dot.style.background = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
  }
  if (field) {
    field.addEventListener("input", function () {
      syncDot();
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
    syncDot();
  }
  document.querySelectorAll("#htSwatches .swatch").forEach(function (sw) {
    sw.addEventListener("click", function (e) {
      if (field) field.value = e.currentTarget.dataset.hex;
      syncDot();
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
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
      setUiState("layerTarget", e.currentTarget.dataset.target); // core/storage.js
      setStatus("Target: " + e.currentTarget.textContent.trim(), "info");
    });
  });
  // Restore the last-used layer target, if one was ever saved. No saved
  // value yet leaves today's hard-coded "All Visible" default untouched.
  let savedTarget = getUiState("layerTarget", null);
  let targetBtn = savedTarget
    ? document.querySelector('.target-strip sp-action-button[data-target="' + savedTarget + '"]')
    : null;
  if (targetBtn) {
    selectOne(".target-strip sp-action-button", targetBtn);
    setLayerTarget(savedTarget);
  }
}

// Shared by the DT-mode chip click handler and initDTStudio()'s own startup
// restore — shows/hides each mode's own section and switches the pipeline
// (engines/print.js setDTMode()).
function applyDTMode(mode, btnEl) {
  if (btnEl) selectOne("#dtModeChips sp-action-button", btnEl);
  setDTMode(mode); // engines/print.js
  document.querySelectorAll(".dt-dtg-only").forEach(function (el) {
    el.classList.toggle("hide", mode === "dtf");
  });
  document.querySelectorAll(".dt-dtf-only").forEach(function (el) {
    el.classList.toggle("hide", mode !== "dtf");
  });
}

// DT Studio (tab 9) — DTG/DTF sub-mode switch (shows/hides each mode's own
// section) plus the halftone-screen checkbox, which just needs to trigger a
// live-preview refresh when toggled (its value is read directly via chk("dtHalftone")
// everywhere else).
function initDTStudio() {
  document.querySelectorAll("#dtModeChips sp-action-button").forEach(function (b) {
    b.addEventListener("click", function (e) {
      let mode = e.currentTarget.dataset.dtmode;
      applyDTMode(mode, e.currentTarget);
      setUiState("dtMode", mode); // core/storage.js
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
  });
  let halftoneChk = document.getElementById("dtHalftone");
  if (halftoneChk) {
    halftoneChk.addEventListener("change", function () {
      if (hasDoc() && EDIT_PANES[_currentTab]) schedulePreview();
    });
  }
  // Restore the last-used DT mode, if one was ever saved. No saved value
  // yet leaves today's hard-coded DTG default untouched.
  let savedMode = getUiState("dtMode", null);
  let modeBtn = savedMode
    ? document.querySelector('#dtModeChips sp-action-button[data-dtmode="' + savedMode + '"]')
    : null;
  if (modeBtn) applyDTMode(savedMode, modeBtn);
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

  initNav();
  initSliders();
  initChips();
  initLayerTarget();
  initDTStudio();
  initModal();
  initPhotoshopEventListeners(); // core/events.js — keeps coverage/fix/RGB-CMYK readouts in sync with PS-native changes

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

  // Footer tools
  bind("undoLast", undoLast); // core/history.js
  bind("runDiagnostics", runDiagnostics); // core/diagnostics.js
  bind("soloGroup", toggleSolo); // core/history.js

  setStatus("Photoneshop ready", "success");

  // loadPresets() reads presets.json from disk (core/storage.js's data
  // folder) — nothing else in init() depends on it having finished, so it
  // no longer blocks every button binding above and the "ready" status
  // behind a file read. It renders the Presets tab's list itself once it
  // resolves. Not awaited, so catch it explicitly here (same handling the
  // outer run() IIFE below gives every other init() failure) rather than
  // letting a render failure become an unhandled rejection instead.
  loadPresets().catch(function (e) {
    console.error("Photoneshop init error (loadPresets):", e);
  });
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
