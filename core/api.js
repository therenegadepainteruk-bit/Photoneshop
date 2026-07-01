/**
 * core/api.js — Photoshop API layer
 * Loaded first. Assigns ALL PS globals to window so every subsequent
 * script can access them regardless of UXP scope behaviour.
 */

const _ps = require("photoshop");
const _uxp = require("uxp");

// ---- explicit window globals (safe across all script files) ----
window.app = _ps.app;
window.core = _ps.core;
window.action = _ps.action;
window.imaging = _ps.imaging;
window.batchPlay = _ps.action.batchPlay;
window.fs = _uxp.storage.localFileSystem;

// Register panel entrypoint (required pattern for apiVersion 2 manifests).
// Our HTML/JS already self-initializes on DOMContentLoaded, so show() is a no-op —
// this just satisfies UXP's expected handshake for the panel host.
try {
  _uxp.entrypoints.setup({
    panels: {
      "photoneshop.panel": {
        show() {},
      },
    },
  });
} catch (e) {
  /* older API versions don't require this — safe to ignore */
}

// ---- base helpers ----
function hasDoc() {
  return window.app.documents.length > 0;
}
function getDoc() {
  return window.app.activeDocument;
}

async function modal(name, fn) {
  return window.core.executeAsModal(fn, { commandName: name });
}
// opts is passed straight through to batchPlay (default: {}, identical to the
// old hardcoded call). The one option this codebase deliberately uses is
// { continueOnError: true } — batchPlay's own documented per-command error
// tolerance — to fold several PHOTOSHOP commands that already each had their
// own independent `.catch(() => {})` into a single round trip without
// changing which of them can fail silently.
async function bp(cmds, opts) {
  return window.batchPlay(cmds, opts || {});
}

// Coalesces every document edit between suspendHistorySuspension() and
// resumeHistorySuspension() — even across SEPARATE executeAsModal calls —
// into exactly ONE named History-panel entry, instead of Photoshop's default
// of one entry per executeAsModal call. This is Photoshop's own documented
// mechanism (executionContext.hostControl.suspendHistory/.resumeHistory), not
// something this plugin re-implements. Must be called from inside an
// executeAsModal callback (needs its executionContext). Always returns either
// a real suspensionID or null — callers must treat null as "unavailable,
// fall back to the default one-state-per-call behaviour" and never let a
// failure here block the actual edit.
async function suspendHistorySuspension(executionContext, name) {
  try {
    const doc = window.app.activeDocument;
    if (!doc || !executionContext || !executionContext.hostControl) return null;
    return await executionContext.hostControl.suspendHistory({ documentID: doc.id, name: name });
  } catch (e) {
    return null;
  }
}

// Resumes (commits) a suspension started by suspendHistorySuspension(),
// optionally giving the finished History-panel entry a clean, final name
// (e.g. "Apply Threshold") that overrides the placeholder name suspension
// started with. Safe to call with a null suspensionID (no-op) — every
// session-ending code path calls this unconditionally so a suspension can
// never be left open.
async function resumeHistorySuspension(suspensionID, finalName) {
  if (!suspensionID) return;
  try {
    if (finalName) suspensionID.finalName = finalName;
    await modal(finalName || "Photoneshop", async function (executionContext) {
      await executionContext.hostControl.resumeHistory(suspensionID);
    });
  } catch (e) {
    /* best-effort — a history-coalescing failure must never block the caller */
  }
}
// Returns the currently active layer's ID — reliable, documented DOM property.
// Used instead of parsing batchPlay's raw result descriptor, whose shape varies
// by action type (mergeVisible+duplicate doesn't return layerID the same way a
// plain duplicate does) — that mismatch caused "Could not create source snapshot".
function activeLayerId() {
  const doc = window.app.activeDocument;
  if (!doc) return null;
  if (doc.activeLayers && doc.activeLayers.length) return doc.activeLayers[0].id;
  if (doc.activeLayer) return doc.activeLayer.id;
  return null;
}
// Runs a layer-creating command (duplicate / mergeVisible+duplicate / make),
// then reads the resulting active layer's ID via the DOM, not the action result.
async function bpCreateLayer(cmds) {
  await window.batchPlay(cmds, {});
  return activeLayerId();
}

function setStatus(msg, type) {
  type = type || "info";
  const s = document.getElementById("status");
  const t = document.getElementById("statusText");
  if (!s || !t) return;
  s.className = "msg show " + type;
  t.textContent = msg;
  if (type !== "error")
    setTimeout(function () {
      s.classList.remove("show");
    }, 3500);
}

function guard() {
  if (!hasDoc()) {
    setStatus("Open an image in Photoshop first", "warning");
    return false;
  }
  // UXP Photoshop exposes colour mode as doc.mode (e.g. "RGBColorMode"),
  // NOT doc.colorModel. Reading colorModel returned
  // undefined, so this guard previously blocked EVERY tool on real documents —
  // RGB ones included. Read doc.mode (with colorModel as a defensive fallback),
  // normalise to a string, and block only when the mode is readable AND clearly
  // not RGB (e.g. CMYK/Grayscale/Lab). Pass on RGB or an unreadable mode so we
  // never false-block a valid document.
  const doc = getDoc();
  const raw = doc && doc.mode != null ? doc.mode : doc ? doc.colorModel : null;
  const mode = (raw == null ? "" : String(raw)).toUpperCase();
  if (mode !== "" && mode.indexOf("RGB") === -1) {
    setStatus("This plugin requires RGB mode. Please convert: Image > Mode > RGB", "warning");
    return false;
  }
  return true;
}

function bind(id, fn) {
  var e = document.getElementById(id);
  if (e) e.addEventListener("click", fn);
}

function val(id) {
  var e = document.getElementById(id);
  return e ? e.value : "";
}
function num(id) {
  return parseFloat(val(id)) || 0;
}
function chk(id) {
  var e = document.getElementById(id);
  return e ? e.checked : false;
}

// Parses a "#rrggbb" colour input value into {r,g,b} 0-255 ints. Falls back to
// black on anything malformed (empty string, missing element, bad format).
function hexToRgb(hex) {
  var m = /^#?([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return { r: 0, g: 0, b: 0 };
  var n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Reads the selected chip in a group of sp-action-button elements (Spectrum's
// "selected" boolean property/attribute drives the pressed visual state,
// replacing the old hand-rolled ".chip.on" CSS class).
function activeChip(group, attr, def) {
  var a = document.querySelector(group + " sp-action-button[selected]");
  return a ? a.dataset[attr] || a.textContent.trim() : def;
}

// Perceptually-weighted luminance (ITU-R BT.601 — the same weighting
// Photoshop's own grayscale/desaturate conversion uses), the single source of
// truth for "how dark is this pixel" everywhere in the plugin. Previously five
// call sites averaged (r+g+b)/3 instead (equal-weighting green and blue with
// red, which reads noticeably lighter/darker than Photoshop's own grayscale
// for saturated colours) while only auto-threshold used the weighted formula —
// ink coverage, halftone tone-sampling, and auto-threshold now all agree on
// what "dark" means. Identical to unweighted averaging for true greys
// (r===g===b), since the weights sum to 1.0, so this does not change output
// for already-greyscale/monochrome artwork.
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Selects exactly one sp-action-button within a group: sets el.selected =
// true, clears .selected on every sibling matched by groupSelector. The
// common half of every chip/segmented-control click handler in this plugin
// (previously reimplemented inline at each call site).
function selectOne(groupSelector, el) {
  document.querySelectorAll(groupSelector).forEach(function (x) {
    x.selected = false;
  });
  if (el) el.selected = true;
}

// ---- op builders (used by all engines) ----
function opBright(b, c) {
  return { _obj: "brightnessEvent", brightness: Math.round(b), center: Math.round(c), useLegacy: false };
}
function opGaussian(px) {
  return { _obj: "gaussianBlur", radius: { _unit: "pixelsUnit", _value: px } };
}
function opMedian(px) {
  return { _obj: "median", radius: { _unit: "pixelsUnit", _value: px } };
}
function opNoise(pct) {
  return {
    _obj: "addNoise",
    distort: { _enum: "distort", _value: "gaussianDistribution" },
    noise: { _unit: "percentUnit", _value: pct },
    monochromatic: true,
  };
}
function opThreshold(lvl) {
  return { _obj: "thresholdClassEvent", level: lvl };
}
function opExposure(e, o, g) {
  return { _obj: "exposure", exposure: e, offset: o, gammaCorrection: g };
}
function opHalftone(r, a) {
  return { _obj: "colorHalftone", maxRadius: { _unit: "pixelsUnit", _value: r }, screenAngles: [a, a, a, a] };
}
function opUnsharp(amt, r, thr) {
  return {
    _obj: "unsharpMask",
    amount: { _unit: "percentUnit", _value: amt },
    radius: { _unit: "pixelsUnit", _value: r },
    threshold: thr,
  };
}

// ---- write-in-progress flag: shared across modules ----
// Tracks whether a putPixels operation is in flight, preventing race conditions
let _writeInProgress = false;
function setWriteInProgress(val) {
  _writeInProgress = val;
}
function getWriteInProgress() {
  return _writeInProgress;
}

// Sets an sp-slider's value AND its adjacent "-V" label. sp-slider clamps its
// own .value to [min,max] on assignment (mirroring the native range input
// behaviour this replaced), so the label is set from el.value AFTER
// assignment — not from the raw `value` argument — to guarantee the two
// never disagree (e.g. a preset requesting lpi:0 on a slider whose min="20").
function setSlider(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  var out = document.getElementById(id + "V");
  if (out) out.textContent = el.value;
}
