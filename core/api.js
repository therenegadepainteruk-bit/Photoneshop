/**
 * core/api.js — Photoshop API layer
 * Loaded first. Assigns ALL PS globals to window so every subsequent
 * script can access them regardless of UXP scope behaviour.
 */

const _ps = require("photoshop");
const _uxp = require("uxp");

// ---- explicit window globals (safe across all script files) ----
window.app      = _ps.app;
window.core     = _ps.core;
window.action   = _ps.action;
window.imaging  = _ps.imaging;
window.batchPlay = _ps.action.batchPlay;
window.fs       = _uxp.storage.localFileSystem;

// Register panel entrypoint (required pattern for apiVersion 2 manifests).
// Our HTML/JS already self-initializes on DOMContentLoaded, so show() is a no-op —
// this just satisfies UXP's expected handshake for the panel host.
try {
  _uxp.entrypoints.setup({
    panels: {
      "photoneshop.panel": {
        show() {}
      }
    }
  });
} catch (e) { /* older API versions don't require this — safe to ignore */ }

// ---- base helpers ----
function hasDoc()  { return window.app.documents.length > 0; }
function getDoc()  { return window.app.activeDocument; }

async function modal(name, fn) {
  return window.core.executeAsModal(fn, { commandName: name });
}
async function bp(cmds) {
  return window.batchPlay(cmds, {});
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
  if (type !== "error") setTimeout(function() { s.classList.remove("show"); }, 3500);
}

function guard() {
  if (!hasDoc()) { setStatus("Open an image in Photoshop first", "warning"); return false; }
  // FIX 2.4 (corrected): UXP Photoshop exposes colour mode as doc.mode
  // (e.g. "RGBColorMode"), NOT doc.colorModel. Reading colorModel returned
  // undefined, so this guard previously blocked EVERY tool on real documents —
  // RGB ones included. Read doc.mode (with colorModel as a defensive fallback),
  // normalise to a string, and block only when the mode is readable AND clearly
  // not RGB (e.g. CMYK/Grayscale/Lab). Pass on RGB or an unreadable mode so we
  // never false-block a valid document.
  const doc = getDoc();
  const raw = (doc && doc.mode != null) ? doc.mode : (doc ? doc.colorModel : null);
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

function val(id)  { var e = document.getElementById(id); return e ? e.value : ""; }
function num(id)  { return parseFloat(val(id)) || 0; }
function chk(id)  { var e = document.getElementById(id); return e ? e.checked : false; }

// Parses a "#rrggbb" colour input value into {r,g,b} 0-255 ints. Falls back to
// black on anything malformed (empty string, missing element, bad format).
function hexToRgb(hex) {
  var m = /^#?([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return { r: 0, g: 0, b: 0 };
  var n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function activeChip(group, attr, def) {
  var a = document.querySelector(group + " .chip.on");
  return a ? (a.dataset[attr] || a.textContent.trim()) : def;
}

// ---- op builders (used by all engines) ----
function opBright(b, c)     { return { _obj: "brightnessEvent", brightness: Math.round(b), center: Math.round(c), useLegacy: false }; }
function opGaussian(px)     { return { _obj: "gaussianBlur", radius: { _unit: "pixelsUnit", _value: px } }; }
function opMedian(px)       { return { _obj: "median", radius: { _unit: "pixelsUnit", _value: px } }; }
function opNoise(pct)       { return { _obj: "addNoise", distort: { _enum: "distort", _value: "gaussianDistribution" }, noise: { _unit: "percentUnit", _value: pct }, monochromatic: true }; }
function opThreshold(lvl)   { return { _obj: "thresholdClassEvent", level: lvl }; }
function opExposure(e, o, g){ return { _obj: "exposure", exposure: e, offset: o, gammaCorrection: g }; }
function opHalftone(r, a)   { return { _obj: "colorHalftone", maxRadius: { _unit: "pixelsUnit", _value: r }, screenAngles: [a, a, a, a] }; }
function opUnsharp(amt, r, thr) { return { _obj: "unsharpMask", amount: { _unit: "percentUnit", _value: amt }, radius: { _unit: "pixelsUnit", _value: r }, threshold: thr }; }

// ---- write-in-progress flag (FIX 1.2): shared across modules ----
// Tracks whether a putPixels operation is in flight, preventing race conditions
let _writeInProgress = false;
function setWriteInProgress(val) { _writeInProgress = val; }
function getWriteInProgress() { return _writeInProgress; }

// ---- fillSlider: defined here so every subsequent file can use it ----
function fillSlider(el) {
  if (!el) return;
  var min = +el.min, max = +el.max, v = +el.value;
  var f = document.getElementById(el.id + "F");
  if (f) f.style.width = "calc(" + ((v - min) / (max - min) * 100) + "% - 8px)";
}

function setSlider(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  var out = document.getElementById(id + "V");
  if (out) out.textContent = value;
  fillSlider(el);
}
