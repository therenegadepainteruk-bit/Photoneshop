/**
 * core/history.js — Action history, layer grouping, solo, coverage, reset
 * Note: setSlider() is defined in core/api.js (loads first).
 */

let _psHistory = [];
let _soloGroup = null;
let _layerTarget = "visible"; // "visible" | "active" | "selection"
const HISTORY_CAP = 100; // caps _psHistory so a long session can't grow it unbounded

// The layer-group names toggleSolo() recognises as a "target" to isolate —
// every group name any Apply action can create (core/preview.js's
// currentGroupName()/effectGroupName(), engines/*'s own group names).
const SOLO_GROUP_NAMES = [
  "DesignStudio",
  "DesignStudioThreshold",
  "DesignStudioTone",
  "DesignStudioVintage",
  "HalftoneDots",
  "CleanupFix",
  "GarmentOptimise",
  "ColoursReduce",
  "WhiteInkUnderbase",
  "SeparationRecolour",
  "DTGOptimise",
  "DTFOptimise",
];

function recordAction(type, name, layerId) {
  // Stores the layer's ID (not just its name) so undoLast() can delete the
  // right layer reliably even if Photoshop auto-renamed it on conflict.
  _psHistory.push({ type: type, name: name, _id: layerId || activeLayerId() });
  if (_psHistory.length > HISTORY_CAP) {
    _psHistory.shift();
  }
}
function setLayerTarget(t) {
  _layerTarget = t;
}

async function undoLast() {
  if (!guard()) return;
  if (_psHistory.length === 0) {
    setStatus("Nothing to undo", "info");
    return;
  }
  let last = _psHistory.pop();
  try {
    // The footer's Undo button is reachable from any tab, including the
    // live-preview ones — don't touch the layer tree while a preview render
    // is still mid-write (same guard applyResult() already uses).
    await waitForRenderLock();
    await modal("Photoneshop: undo", async function () {
      let doc = window.app.activeDocument;
      if (!doc) return;
      // Delete by ID (reliable even after a Photoshop auto-rename); only
      // fall back to matching by name if this entry has no ID at all —
      // recordAction() couldn't resolve one because there was no active
      // layer at the moment the action was recorded.
      if (last._id) {
        await bp([{ _obj: "delete", _target: [{ _ref: "layer", _id: last._id }] }]).catch(function () {});
      } else {
        let layers = doc.layers;
        for (let i = 0; i < layers.length; i++) {
          if (layers[i].name === last.name) {
            await bp([{ _obj: "delete", _target: [{ _ref: "layer", _name: last.name }] }]).catch(function () {});
            break;
          }
        }
      }
    });
    setStatus("Removed: " + last.name, "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function stampLayer(name) {
  if (_layerTarget === "active") {
    await bp([{ _obj: "duplicate", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }], name: name }]);
  } else {
    // Both steps target "targetEnum" (the layer just made active by mergeVisible)
    // and neither previously caught its own errors, so one batchPlay round trip
    // is behaviourally identical to the previous two.
    await bp([
      { _obj: "mergeVisible", duplicate: true },
      {
        _obj: "set",
        _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
        to: { _obj: "layer", name: name },
      },
    ]);
  }
}

async function groupSelectedInto(group, layerId) {
  try {
    let doc = window.app.activeDocument;
    if (!doc) return;
    let layers = doc.layers;
    let exists = false;
    for (let i = 0; i < layers.length; i++) {
      let L = layers[i];
      if (L.name === group && L.layers && L.layers.length >= 0) {
        exists = true;
        break;
      }
    }
    // Prefer an explicit layer-ID reference over "the current selection" when
    // the caller already knows which layer it means — more reliable than
    // relying on selection state still being what the caller left it as.
    const targetRef = layerId
      ? { _ref: "layer", _id: layerId }
      : { _ref: "layer", _enum: "ordinal", _value: "targetEnum" };
    if (!exists) {
      await bp([{ _obj: "make", _target: [{ _ref: "layerSection" }], from: targetRef, name: group }]).catch(
        async function () {
          await bp([{ _obj: "groupEvent" }]).catch(function () {});
          await bp([{ _obj: "set", _target: [targetRef], to: { _obj: "layer", name: group } }]).catch(function () {});
        }
      );
    } else {
      await bp([{ _obj: "move", _target: [targetRef], to: { _ref: "layer", _name: group } }]).catch(function () {});
    }
  } catch (e) {
    /* grouping is best-effort; never block the op */
  }
}

async function stampInGroup(name, group) {
  await stampLayer(name);
  await groupSelectedInto(group);
  recordAction("group", group);
}

async function runNonDestructive(name, cmds, group) {
  await modal(name, async function () {
    await stampInGroup(name, group || name);
    await bp(cmds);
  });
}

async function toggleSolo() {
  if (!guard()) return;
  try {
    // The footer's Solo button is reachable from any tab, including the
    // live-preview ones — don't toggle layer visibility while a preview
    // render is still mid-write (same guard applyResult() already uses).
    await waitForRenderLock();
    await modal("Photoneshop: solo", async function () {
      let doc = window.app.activeDocument;
      if (!doc) return;
      let layers = doc.layers;
      let target = null;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].selected && SOLO_GROUP_NAMES.indexOf(layers[i].name) !== -1) {
          target = layers[i].name;
          break;
        }
      }
      // Each layer's show/hide was previously its own batchPlay round trip with
      // its own independent .catch(() => {}) — one command failing never
      // affected the rest. continueOnError:true gives the exact same per-command
      // tolerance in a single call, turning N redraws into 1.
      if (!target || _soloGroup === target) {
        const cmds = [];
        for (let j = 0; j < layers.length; j++)
          cmds.push({ _obj: "show", null: [{ _ref: "layer", _name: layers[j].name }] });
        if (cmds.length) await bp(cmds, { continueOnError: true }).catch(function () {});
        _soloGroup = null;
      } else {
        const cmds = [];
        for (let k = 0; k < layers.length; k++) {
          let cmd = layers[k].name === target ? "show" : "hide";
          cmds.push({ _obj: cmd, null: [{ _ref: "layer", _name: layers[k].name }] });
        }
        if (cmds.length) await bp(cmds, { continueOnError: true }).catch(function () {});
        _soloGroup = target;
      }
    });
    setStatus(_soloGroup ? "Showing only: " + _soloGroup : "All layers visible", "info");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

// Samples the currently visible pixels at a small target size in a single
// getPixels() pass and returns both ink coverage and colour-cluster count —
// shared by the footer's live coverage readout (updateCoverage(), below,
// which only needs .inkPct) and Print Doctor's analysis (ai/analysis.js
// runPrintDoctor(), which needs both), so neither duplicates the pixel read
// or disagrees on what counts as "ink" (a pixel darker than mid-grey by
// luminance() — core/api.js).
async function samplePixelStats(size) {
  let dark = 0,
    total = 0;
  let colorSet = {};
  await modal("Photoneshop: coverage sample", async function () {
    let px = await window.imaging.getPixels({ targetSize: { width: size, height: size } });
    let buf = await px.imageData.getData();
    let comps = px.imageData.components;
    for (let i = 0; i < buf.length; i += comps) {
      let r = buf[i],
        g = buf[i + 1] || 0,
        b = buf[i + 2] || 0;
      let grey = comps >= 3 ? luminance(r, g, b) : r;
      if (grey < 128) dark++;
      colorSet[Math.round(r / 16) + "," + Math.round(g / 16) + "," + Math.round(b / 16)] = 1;
      total++;
    }
    px.imageData.dispose();
  });
  return {
    dark: dark,
    total: total,
    inkPct: total ? Math.round((dark / total) * 100) : 0,
    colorCount: Object.keys(colorSet).length,
  };
}

async function updateCoverage() {
  let out = document.getElementById("coverageVal");
  if (!out || !hasDoc()) return;
  try {
    // getPixels() needs an active layer to read from — bail out to the "—"
    // placeholder instead of letting it throw when there isn't one.
    let doc = window.app.activeDocument;
    if (!doc || !doc.activeLayer) {
      out.textContent = "—";
      return;
    }

    const r = await samplePixelStats(120);
    out.textContent = r.total ? r.inkPct + "%" : "—";
  } catch (e) {
    /* non-critical */
  }
}

let SLIDER_DEFAULTS = {
  thresh: 128,
  exposure: 0,
  highlight: 0,
  shadow: 0,
  bright: 0,
  contrast: 0,
  blur: 0,
  halftone: 100,
  htSize: 8,
  htAngle: 45,
  dotGain: 0,
  lpi: 45,
  htColor: "#000000",
  fade: 0,
  distress: 0,
  bleed: 0,
  grain: 0,
  wDensity: 100,
  wChoke: 0,
  wFeather: 0,
  wHl: 0,
  dtgInk: 0,
  dtgWhite: 0,
  dtgDetail: 0,
  dtfCol: 0,
  dtfInk: 0,
  dtfSharp: 0,
};

async function resetAll() {
  Object.keys(SLIDER_DEFAULTS).forEach(function (id) {
    setSlider(id, SLIDER_DEFAULTS[id]); // setSlider defined in core/api.js
  });
  let eff = document.getElementById("effect");
  if (eff) eff.value = "none";
  if (_previewActive || _sourceReady) await cancelPreview(); // cancelPreview in core/preview.js
  setStatus("Reset to defaults", "info");
}
