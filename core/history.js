/**
 * core/history.js — Action history, layer grouping, solo, coverage, reset
 * Note: fillSlider() and setSlider() are defined in core/api.js (loads first).
 */

let _psHistory = [];
let _soloGroup = null;
let _layerTarget = "visible"; // "visible" | "active" | "selection"
const HISTORY_CAP = 100; // FIX 2.6: Prevent unbounded history growth

let TAB_GROUPS = [
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
  // FIX 2.3: Store layer ID instead of just name for reliable deletion on undo
  _psHistory.push({ type: type, name: name, _id: layerId || activeLayerId() });
  // FIX 2.6: Cap history at 100 entries
  if (_psHistory.length > HISTORY_CAP) {
    _psHistory.shift();
  }
}
function getLayerTarget() {
  return _layerTarget;
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
    await modal("Photoneshop: undo", async function () {
      let doc = window.app.activeDocument;
      if (!doc) return;
      // FIX 2.3: Delete by ID instead of name for reliability
      if (last._id) {
        await bp([{ _obj: "delete", _target: [{ _ref: "layer", _id: last._id }] }]).catch(function () {});
      } else {
        // Fallback for legacy history entries without ID
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
    await bp([{ _obj: "mergeVisible", duplicate: true }]);
    await bp([
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
    // FIX 2.9: Use explicit _id reference if layerId provided, otherwise use selection
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
    await modal("Photoneshop: solo", async function () {
      let doc = window.app.activeDocument;
      if (!doc) return;
      let layers = doc.layers;
      let target = null;
      for (let i = 0; i < layers.length; i++) {
        if (layers[i].selected && TAB_GROUPS.indexOf(layers[i].name) !== -1) {
          target = layers[i].name;
          break;
        }
      }
      if (!target || _soloGroup === target) {
        for (let j = 0; j < layers.length; j++)
          await bp([{ _obj: "show", null: [{ _ref: "layer", _name: layers[j].name }] }]).catch(function () {});
        _soloGroup = null;
      } else {
        for (let k = 0; k < layers.length; k++) {
          let cmd = layers[k].name === target ? "show" : "hide";
          await bp([{ _obj: cmd, null: [{ _ref: "layer", _name: layers[k].name }] }]).catch(function () {});
        }
        _soloGroup = target;
      }
    });
    setStatus(_soloGroup ? "Showing only: " + _soloGroup : "All layers visible", "info");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function updateCoverage() {
  let out = document.getElementById("coverageVal");
  if (!out || !hasDoc()) return;
  try {
    // FIX 2.11: Validate activeLayer exists before calling getPixels
    let doc = window.app.activeDocument;
    if (!doc || !doc.activeLayer) {
      out.textContent = "—";
      return;
    }

    let ink = 0,
      total = 0;
    await modal("Photoneshop: coverage", async function () {
      let px = await window.imaging.getPixels({ targetSize: { width: 120, height: 120 } });
      let buf = await px.imageData.getData();
      let comps = px.imageData.components;
      for (let i = 0; i < buf.length; i += comps) {
        let g = comps >= 3 ? (buf[i] + buf[i + 1] + buf[i + 2]) / 3 : buf[i];
        if (g < 128) ink++;
        total++;
      }
      px.imageData.dispose();
    });
    out.textContent = total ? Math.round((ink / total) * 100) + "%" : "—";
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
