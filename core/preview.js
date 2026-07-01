/**
 * core/preview.js — Non-destructive snapshot preview
 * Layers are tracked by numeric ID (not name) so a Photoshop auto-rename on
 * conflict (e.g. "Photoneshop Preview copy 2") never breaks subsequent lookups —
 * this was the root cause of unreliable live preview across all tabs.
 */

let EDIT_PANES = { 2: true, 3: true, 6: true, 9: true };
// Tab 2=Design Studio, 3=Halftone, 6=White Ink, 9=DT Studio (DTG+DTF) — all live-preview tabs.
const TAB_GROUP = { 3: "HalftoneDots", 6: "WhiteInkUnderbase" };
// tab 2 (Design Studio) uses effectGroupName() below since it covers 3 sub-effects.
// tab 9 (DT Studio) group name depends on its DTG/DTF sub-mode — see currentGroupName().

// NOTE: tab 3 (Halftone) is NOT in this map — it's computed via direct pixel
// I/O (engines/halftone.js writeHalftoneToLayer), not a batchPlay command array,
// so it's special-cased in refreshPreview()/applyResult() below instead.
function currentPipeline() {
  const map = { 2: buildPipeline, 6: buildWhiteInkPipeline, 9: buildDTPipeline };
  return (map[_currentTab] || buildPipeline)();
}

// tab 9 (DT Studio)'s group name depends on getDTMode() (engines/print.js),
// not a static tab-number lookup like every other live-preview tab.
function currentGroupName() {
  if (_currentTab === 9) return getDTMode() === "dtf" ? "DTFOptimise" : "DTGOptimise";
  return TAB_GROUP[_currentTab] || effectGroupName();
}

let _currentTab = 2;
let _previewActive = false;
let _sourceReady = false;
let _sourceId = null;
let _previewId = null;
let _previewTimer = null;
let _previewDirty = false;
let _busy = false;
// FIX 1.2: _writeInProgress moved to core/api.js for sharing with halftone.js
let _renderGen = 0; // monotonically increasing — every render claims one
let _targetDocId = null; // the document this preview session belongs to
const DEBOUNCE_MS = 130;

// Every NEW desired operation (a fresh preview tick, or Apply, or Cancel)
// bumps this and returns its own id. Any in-flight async work that captured
// an OLDER id can check `myGen !== _renderGen` right before it writes pixels,
// and simply abort if it's been superseded — avoids the "stale write" race
// (slider moved again mid-render, or Apply clicked mid-render).
function bumpRenderGen() {
  return ++_renderGen;
}
function isRenderStale(myGen) {
  return myGen !== _renderGen;
}

// Waits for any in-flight render to finish before a caller (Apply/Cancel)
// proceeds to touch the same layers. Bounded so a stuck render can't hang
// the UI forever — proceeds anyway after the timeout, with a warning.
// FIX 1.2: Also waits for in-flight putPixels to complete
async function waitForRenderLock(maxMs) {
  const start = Date.now();
  while ((_busy || getWriteInProgress()) && Date.now() - start < (maxMs || 4000)) {
    await new Promise(function (r) {
      setTimeout(r, 30);
    });
  }
  if (_busy || getWriteInProgress()) {
    setStatus("Warning: previous render did not finish in time", "warning");
  }
  return !_busy && !getWriteInProgress();
}

// True if the document this preview session was started against is still
// the active one — guards against a "document switching" race.
function docStillValid() {
  const doc = window.app.activeDocument;
  return doc && (_targetDocId == null || doc.id === _targetDocId);
}

// FIX 2.2: Clear preview timer to prevent accumulation on tab switches
function clearPreviewTimer() {
  if (_previewTimer) {
    clearTimeout(_previewTimer);
    _previewTimer = null;
  }
}

async function refreshPreview() {
  if (_busy) {
    _previewDirty = true;
    return;
  }
  _busy = true;
  const myGen = bumpRenderGen();
  let failed = false;
  try {
    // FIX 1.5: Merge ensureSource and buildPreview into a single modal call to prevent nesting
    await modal("Photoneshop: preview (unified)", async function () {
      // Ensure source layer exists
      if (!_sourceReady || _sourceId == null) {
        if (!docStillValid()) throw new Error("Active document changed during preview");
        _tonalWarningShown = false;
        _targetDocId = window.app.activeDocument ? window.app.activeDocument.id : null;
        _sourceId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
        if (_sourceId == null) throw new Error("Could not create source snapshot");
        await bp([
          {
            _obj: "set",
            _target: [{ _ref: "layer", _id: _sourceId }],
            to: { _obj: "layer", name: "Photoneshop Source" },
          },
        ]);
        await bp([{ _obj: "hide", null: [{ _ref: "layer", _id: _sourceId }] }]).catch(function () {});
        _sourceReady = true;
      }

      // Build preview from source
      if (!docStillValid()) {
        throw new Error("Active document changed during preview");
      }
      if (isRenderStale(myGen)) return; // superseded while we were still snapshotting
      if (_previewId != null) {
        await bp([{ _obj: "delete", _target: [{ _ref: "layer", _id: _previewId }] }]).catch(function () {});
        _previewId = null;
      }
      _previewId = await bpCreateLayer([
        { _obj: "duplicate", _target: [{ _ref: "layer", _id: _sourceId }], name: "Photoneshop Preview" },
      ]);
      if (_previewId == null) throw new Error("Could not create preview layer");
      if (isRenderStale(myGen)) return; // superseded mid-duplicate
      // show/select/move each had their own independent .catch(() => {}) — this
      // runs on every debounced preview tick, so folding them into one
      // continueOnError:true call (same per-command tolerance) cuts 3 redraws to 1.
      await bp(
        [
          { _obj: "show", null: [{ _ref: "layer", _id: _previewId }] },
          { _obj: "select", _target: [{ _ref: "layer", _id: _previewId }], makeVisible: true },
          {
            _obj: "move",
            _target: [{ _ref: "layer", _id: _previewId }],
            to: { _ref: "layer", _enum: "ordinal", _value: "front" },
          },
        ],
        { continueOnError: true }
      ).catch(function () {});
      if (isRenderStale(myGen)) return; // superseded before the (potentially slow) write stage

      // Apply tab-specific processing
      if (_currentTab === 3) {
        let v = await writeHalftoneToLayer(_previewId, myGen); // engines/halftone.js — checks staleness again right before its own putPixels
        if (v && !v.hasVariation && !_tonalWarningShown) {
          _tonalWarningShown = true;
          setStatus(
            "Artwork is mostly flat/binary — halftone will look like a solid fill. Add tone variation first for visible dots.",
            "warning"
          );
        }
      } else {
        if (!isRenderStale(myGen)) await bp(currentPipeline());
        // DT Studio's optional halftone-screen step: same real pixel-based
        // renderer as tab 3, applied on top of the DTG/DTF live preview layer.
        if (_currentTab === 9 && chk("dtHalftone") && !isRenderStale(myGen)) {
          await writeHalftoneToLayer(_previewId, myGen);
        }
      }
    });
    _previewActive = true;
  } catch (e) {
    failed = true;
    setStatus("Preview error: " + (e.message || e), "error");
  } finally {
    _busy = false;
    // On failure, do NOT immediately retry — that previously caused a tight
    // infinite loop hammering Photoshop (the reported severe slowdown).
    // Just consume the dirty flag; the next slider move will try again normally.
    if (failed) {
      _previewDirty = false;
    } else if (_previewDirty) {
      _previewDirty = false;
      setTimeout(refreshPreview, 0);
    } else {
      updateCoverage();
    }
  }
}

// Self-rescheduling setTimeout chain rather than setInterval: identical
// timing (fires at most once every DEBOUNCE_MS while a slider keeps moving,
// stops on its own the first tick nothing changed since), but only ever has
// one pending timer scheduled at a time instead of a recurring interval
// ticking on a fixed clock regardless of whether refreshPreview is keeping up.
function schedulePreview() {
  if (!hasDoc() || !EDIT_PANES[_currentTab]) return;
  _previewDirty = true;
  if (_previewTimer) return;
  const tick = function () {
    if (!_previewDirty) {
      _previewTimer = null;
      return;
    }
    _previewDirty = false;
    refreshPreview();
    _previewTimer = setTimeout(tick, DEBOUNCE_MS);
  };
  _previewTimer = setTimeout(tick, DEBOUNCE_MS);
}

async function removePreview() {
  if (!_previewActive && !_sourceReady) return;
  try {
    await modal("Photoneshop: remove preview", async function () {
      // Both deletes previously had independent .catch(() => {}) — merge with
      // continueOnError:true so one failing still lets the other run, same as before.
      const cmds = [];
      if (_previewId != null) cmds.push({ _obj: "delete", _target: [{ _ref: "layer", _id: _previewId }] });
      if (_sourceId != null) cmds.push({ _obj: "delete", _target: [{ _ref: "layer", _id: _sourceId }] });
      if (cmds.length) await bp(cmds, { continueOnError: true }).catch(function () {});
    });
  } catch (e) {
    /* best-effort */
  }
  _previewActive = false;
  _sourceReady = false;
  _previewId = null;
  _sourceId = null;
}

// Most accurate GROUP name for Design Studio (covers 3 sub-effects in one tab).
function effectGroupName() {
  let threshChanged = parseInt(val("thresh"), 10) !== 128;
  let toneChanged =
    num("exposure") !== 0 ||
    num("highlight") !== 0 ||
    num("shadow") !== 0 ||
    num("bright") !== 0 ||
    num("contrast") !== 0 ||
    num("blur") !== 0;
  let vintageChanged =
    num("fade") !== 0 || num("distress") !== 0 || num("bleed") !== 0 || num("grain") !== 0 || val("effect") !== "none";
  let changedCount = (threshChanged ? 1 : 0) + (toneChanged ? 1 : 0) + (vintageChanged ? 1 : 0);
  if (changedCount === 1) {
    if (threshChanged) return "DesignStudioThreshold";
    if (toneChanged) return "DesignStudioTone";
    return "DesignStudioVintage";
  }
  return "DesignStudio";
}

// Per-tab LAYER name describing the actual settings used, so the layer itself
// (not just its group) is self-documenting — e.g. "8px 45°" for a halftone layer.
function resultLayerName() {
  switch (_currentTab) {
    case 3:
      return val("lpi") + "lpi " + val("htAngle") + "\u00b0";
    case 6:
      return "Underbase " + val("wDensity") + "%";
    case 9: {
      // DT Studio — DTG + DTF combined (engines/print.js getDTMode()), plus an
      // optional halftone-screen step reusing the Halftone tab's LPI/Angle.
      let parts = [];
      if (getDTMode() === "dtf") {
        if (num("dtfCol") > 0) parts.push("Colour +" + val("dtfCol") + "%");
        if (num("dtfInk") > 0) parts.push("Ink -" + val("dtfInk") + "%");
        if (num("dtfSharp") > 0) parts.push("Sharpen +" + val("dtfSharp") + "%");
      } else {
        if (num("dtgInk") > 0) parts.push("Ink -" + val("dtgInk") + "%");
        if (num("dtgWhite") > 0) parts.push("White +" + val("dtgWhite") + "%");
        if (num("dtgDetail") > 0) parts.push("Detail +" + val("dtgDetail") + "%");
      }
      if (chk("dtHalftone")) parts.push(val("lpi") + "lpi Halftone");
      return parts.length ? parts.join(", ") : getDTMode() === "dtf" ? "DTF Optimised" : "DTG Optimised";
    }
    default:
      return effectGroupName().replace("DesignStudio", "") || "Result";
  }
}

async function applyResult() {
  if (!guard()) return;
  try {
    setStatus("Applying…", "info");
    const myGen = bumpRenderGen(); // signal any in-flight preview tick that it's now superseded
    await waitForRenderLock(); // don't touch the layer while a render is still mid-write
    let groupName = currentGroupName();
    let layerName = resultLayerName();
    if (!_previewActive) {
      await modal("Photoneshop: apply", async function () {
        let id = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
        await bp([{ _obj: "set", _target: [{ _ref: "layer", _id: id }], to: { _obj: "layer", name: layerName } }]);
        if (_currentTab === 3) {
          await writeHalftoneFinal(id, myGen);
        } else {
          await bp(currentPipeline());
          if (_currentTab === 9 && chk("dtHalftone")) await writeHalftoneFinal(id, myGen);
        }
        await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: id }] }]).catch(function () {});
        await groupSelectedInto(groupName);
      });
    } else {
      await modal("Photoneshop: commit", async function () {
        if (_currentTab === 3) {
          await writeHalftoneFinal(_previewId, myGen);
        } else if (_currentTab === 9 && chk("dtHalftone")) {
          await writeHalftoneFinal(_previewId, myGen); // upgrade fast live preview -> full quality
        }
        await bp([
          { _obj: "set", _target: [{ _ref: "layer", _id: _previewId }], to: { _obj: "layer", name: layerName } },
        ]);
        // Deleting the leftover source layer and selecting the result each had
        // their own independent .catch(() => {}) — one continueOnError:true call
        // preserves that (either can fail without blocking the other).
        const cleanupCmds = [];
        if (_sourceId != null) cleanupCmds.push({ _obj: "delete", _target: [{ _ref: "layer", _id: _sourceId }] });
        cleanupCmds.push({ _obj: "select", _target: [{ _ref: "layer", _id: _previewId }] });
        await bp(cleanupCmds, { continueOnError: true }).catch(function () {});
        await groupSelectedInto(groupName);
      });
      _previewActive = false;
      _sourceReady = false;
      _previewId = null;
      _sourceId = null;
    }
    recordAction("group", groupName);
    saveLastUsed();
    setStatus("Applied — " + layerName + " in " + groupName, "success");
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

async function cancelPreview() {
  if (!_previewActive && !_sourceReady) return;
  clearPreviewTimer(); // FIX 2.2: Clear timer on cancel
  bumpRenderGen(); // supersede any in-flight render so it aborts before writing
  await waitForRenderLock(); // don't delete layers a render is still mid-write into
  await removePreview();
  setStatus("Preview cancelled", "info");
}
