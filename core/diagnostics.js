/**
 * core/diagnostics.js — Structured diagnostic suite per the agreed plan.
 * Does NOT modify the rendering engine, halftone algorithm, or putPixels usage —
 * it only OBSERVES and reports on them, isolating exactly which stage fails.
 * Each test logs: width, height, buffer length, expected length, components,
 * timing per stage, success/failure, and any exception — verbatim, nothing assumed.
 */

let _diagLog = [];

function diagLog(line) {
  _diagLog.push(line);
  const el = document.getElementById("diagLog");
  if (el) {
    el.textContent = _diagLog.join("\n");
    el.scrollTop = el.scrollHeight;
  }
}
function diagReset() {
  _diagLog = [];
  const el = document.getElementById("diagLog");
  if (el) el.textContent = "";
}

function logImageDataShape(label, imgData) {
  let keys = [];
  try {
    keys = Object.keys(imgData);
  } catch (e) {}
  diagLog(
    label +
      " -> width=" +
      imgData.width +
      " height=" +
      imgData.height +
      " components=" +
      imgData.components +
      " colorSpace=" +
      (imgData.colorSpace !== undefined ? imgData.colorSpace : "(not exposed)") +
      " keys=[" +
      keys.join(",") +
      "]"
  );
}

async function cleanupTestLayer(layerId) {
  if (layerId == null) return;
  await bp([{ _obj: "delete", _target: [{ _ref: "layer", _id: layerId }] }]).catch(function () {});
}

// ---------------------------------------------------------------------------
// TEST 1 — Write a trivial solid-colour buffer. Zero processing, zero reading.
// ---------------------------------------------------------------------------
async function diagTest1() {
  diagLog("=== TEST 1: createImageDataFromBuffer + putPixels, 100\u00d7100 solid red, no processing ===");
  if (!guard()) {
    diagLog("SKIPPED: no document open");
    return false;
  }
  const w = 100,
    h = 100,
    expected = w * h * 4;
  const buf = new Uint8Array(expected);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = 255;
    buf[i * 4 + 1] = 0;
    buf[i * 4 + 2] = 0;
    buf[i * 4 + 3] = 255;
  }
  diagLog(
    "Buffer length: " + buf.length + " | expected (w*h*4): " + expected + " | match: " + (buf.length === expected)
  );
  let layerId = null;
  const t0 = Date.now();
  try {
    await modal("Diag Test 1", async function () {
      layerId = await bpCreateLayer([
        { _obj: "make", _target: [{ _ref: "layer" }], using: { _obj: "layer", name: "__DiagTest1" } },
      ]);
      diagLog("Test layer created, id=" + layerId + " (took " + (Date.now() - t0) + "ms)");
      const ta = Date.now();
      const imgData = await window.imaging.createImageDataFromBuffer(buf, {
        width: w,
        height: h,
        components: 4,
        colorSpace: "RGB",
      });
      const tb = Date.now();
      logImageDataShape("createImageDataFromBuffer result", imgData);
      diagLog("createImageDataFromBuffer: " + (tb - ta) + "ms");
      await window.imaging.putPixels({
        layerID: layerId,
        imageData: imgData,
        targetBounds: { left: 0, top: 0, right: w, bottom: h },
      });
      const tc = Date.now();
      diagLog("putPixels: " + (tc - tb) + "ms");
      if (imgData.dispose) imgData.dispose();
      await cleanupTestLayer(layerId);
    });
    diagLog("TEST 1: SUCCESS (total " + (Date.now() - t0) + "ms)");
    return true;
  } catch (e) {
    diagLog("TEST 1: FAILED \u2014 " + (e && e.message ? e.message : e));
    await cleanupTestLayer(layerId);
    return false;
  }
}

// ---------------------------------------------------------------------------
// TEST 2 — Identity copy: getPixels -> putPixels unchanged.
// ---------------------------------------------------------------------------
async function diagTest2() {
  diagLog("=== TEST 2: getPixels \u2192 putPixels, completely unmodified ===");
  if (!guard()) {
    diagLog("SKIPPED: no document open");
    return false;
  }
  let layerId = null;
  const t0 = Date.now();
  try {
    await modal("Diag Test 2", async function () {
      layerId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
      await bp([
        { _obj: "set", _target: [{ _ref: "layer", _id: layerId }], to: { _obj: "layer", name: "__DiagTest2" } },
      ]);
      const ta = Date.now();
      const px = await window.imaging.getPixels({ layerID: layerId });
      const tb = Date.now();
      logImageDataShape("getPixels result", px.imageData);
      const buf = await px.imageData.getData();
      const w = px.imageData.width,
        h = px.imageData.height,
        comps = px.imageData.components;
      const expected = w * h * comps;
      diagLog(
        "getPixels: " +
          (tb - ta) +
          "ms | bufferLength=" +
          buf.length +
          " | expected(w*h*components)=" +
          expected +
          " | match=" +
          (buf.length === expected)
      );
      px.imageData.dispose();
      const tc = Date.now();
      const imgData = await window.imaging.createImageDataFromBuffer(buf, {
        width: w,
        height: h,
        components: comps,
        colorSpace: "RGB",
      });
      const td = Date.now();
      diagLog("createImageDataFromBuffer: " + (td - tc) + "ms");
      await window.imaging.putPixels({
        layerID: layerId,
        imageData: imgData,
        targetBounds: { left: 0, top: 0, right: w, bottom: h },
      });
      const te = Date.now();
      diagLog("putPixels: " + (te - td) + "ms");
      if (imgData.dispose) imgData.dispose();
      await cleanupTestLayer(layerId);
    });
    diagLog("TEST 2: SUCCESS (total " + (Date.now() - t0) + "ms)");
    return true;
  } catch (e) {
    diagLog("TEST 2: FAILED \u2014 " + (e && e.message ? e.message : e));
    await cleanupTestLayer(layerId);
    return false;
  }
}

// ---------------------------------------------------------------------------
// TEST 3 — Read, change exactly one pixel, write back.
// ---------------------------------------------------------------------------
async function diagTest3() {
  diagLog("=== TEST 3: getPixels \u2192 modify exactly 1 pixel \u2192 putPixels ===");
  if (!guard()) {
    diagLog("SKIPPED: no document open");
    return false;
  }
  let layerId = null;
  const t0 = Date.now();
  try {
    await modal("Diag Test 3", async function () {
      layerId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
      await bp([
        { _obj: "set", _target: [{ _ref: "layer", _id: layerId }], to: { _obj: "layer", name: "__DiagTest3" } },
      ]);
      const ta = Date.now();
      const px = await window.imaging.getPixels({ layerID: layerId });
      const tb = Date.now();
      const buf = await px.imageData.getData();
      const w = px.imageData.width,
        h = px.imageData.height,
        comps = px.imageData.components;
      diagLog(
        "getPixels: " +
          (tb - ta) +
          "ms | bufferLength=" +
          buf.length +
          " | expected=" +
          w * h * comps +
          " | match=" +
          (buf.length === w * h * comps)
      );
      px.imageData.dispose();
      buf[0] = 0;
      buf[1] = 255;
      buf[2] = 0;
      if (comps >= 4) buf[3] = 255; // pixel (0,0) -> bright green
      diagLog("Modified pixel (0,0) to RGB(0,255,0)");
      const tc = Date.now();
      const imgData = await window.imaging.createImageDataFromBuffer(buf, {
        width: w,
        height: h,
        components: comps,
        colorSpace: "RGB",
      });
      const td = Date.now();
      diagLog("createImageDataFromBuffer: " + (td - tc) + "ms");
      await window.imaging.putPixels({
        layerID: layerId,
        imageData: imgData,
        targetBounds: { left: 0, top: 0, right: w, bottom: h },
      });
      const te = Date.now();
      diagLog("putPixels: " + (te - td) + "ms");
      if (imgData.dispose) imgData.dispose();
      await cleanupTestLayer(layerId);
    });
    diagLog("TEST 3: SUCCESS (total " + (Date.now() - t0) + "ms)");
    return true;
  } catch (e) {
    diagLog("TEST 3: FAILED \u2014 " + (e && e.message ? e.message : e));
    await cleanupTestLayer(layerId);
    return false;
  }
}

// ---------------------------------------------------------------------------
// TEST 4 — The REAL halftone algorithm (unmodified, reused from engines/halftone.js),
// at a small, safe 500x500 size. Layer is left in the document (not deleted) so
// the actual visual result can be inspected.
// ---------------------------------------------------------------------------
async function diagTest4() {
  diagLog("=== TEST 4: real computeHalftoneBuffer() on 500\u00d7500, full stage timing ===");
  if (!guard()) {
    diagLog("SKIPPED: no document open");
    return false;
  }
  let layerId = null;
  const t0 = Date.now();
  try {
    await modal("Diag Test 4", async function () {
      layerId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
      await bp([
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: layerId }],
          to: { _obj: "layer", name: "__DiagTest4 (halftone result)" },
        },
      ]);
      const ta = Date.now();
      const px = await window.imaging.getPixels({ layerID: layerId, targetSize: { width: 500, height: 500 } });
      const tb = Date.now();
      const buf = await px.imageData.getData();
      const w = px.imageData.width,
        h = px.imageData.height,
        comps = px.imageData.components;
      diagLog(
        "getPixels: " +
          (tb - ta) +
          "ms | w=" +
          w +
          " h=" +
          h +
          " components=" +
          comps +
          " bufferLength=" +
          buf.length +
          " expected=" +
          w * h * comps
      );
      px.imageData.dispose();

      const tc = Date.now();
      const out = computeHalftoneBuffer(buf, comps, w, h, 45, 45, 0, 300, 0, 0, 0); // the REAL, unmodified function
      const td = Date.now();
      diagLog("halftone compute: " + (td - tc) + "ms | outputLength=" + out.length + " expected=" + w * h * 4);

      const te = Date.now();
      const imgData = await window.imaging.createImageDataFromBuffer(out, {
        width: w,
        height: h,
        components: 4,
        colorSpace: "RGB",
      });
      const tf = Date.now();
      diagLog("createImageDataFromBuffer: " + (tf - te) + "ms");

      await window.imaging.putPixels({
        layerID: layerId,
        imageData: imgData,
        targetBounds: { left: 0, top: 0, right: w, bottom: h },
      });
      const tg = Date.now();
      diagLog("putPixels: " + (tg - tf) + "ms");
      diagLog("TOTAL (all 4 stages): " + (tg - ta) + "ms");
      if (imgData.dispose) imgData.dispose();
      await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }] }]).catch(function () {});
    });
    diagLog(
      "TEST 4: SUCCESS \u2014 layer '__DiagTest4 (halftone result)' left in your document, check it visually, then delete it manually."
    );
    return true;
  } catch (e) {
    diagLog("TEST 4: FAILED \u2014 " + (e && e.message ? e.message : e));
    await cleanupTestLayer(layerId); // FIX 1.6: Ensure cleanup on failure
    return false;
  }
}

async function runDiagnostics() {
  diagReset();
  diagLog("Photoneshop Diagnostic Suite \u2014 " + new Date().toString());
  diagLog("");
  setStatus("Running diagnostics\u2026", "info");

  const ok1 = await diagTest1();
  diagLog("");
  if (!ok1) {
    diagLog(
      "STOPPED \u2014 Test 1 failed. The basic write path itself does not work; nothing past this point can be trusted."
    );
    setStatus("Diagnostics: Test 1 failed", "error");
    return;
  }

  const ok2 = await diagTest2();
  diagLog("");
  if (!ok2) {
    diagLog(
      "STOPPED \u2014 Test 2 failed. Writing works, but the read\u2192write round-trip is broken (likely a buffer/stride mismatch)."
    );
    setStatus("Diagnostics: Test 2 failed", "error");
    return;
  }

  const ok3 = await diagTest3();
  diagLog("");
  if (!ok3) {
    diagLog("STOPPED \u2014 Test 3 failed. Round-trip works, but modify-then-write is broken.");
    setStatus("Diagnostics: Test 3 failed", "error");
    return;
  }

  const ok4 = await diagTest4();
  diagLog("");
  if (ok4) {
    diagLog("ALL TESTS PASSED. The imaging read/write pipeline is sound at small scale.");
    diagLog(
      "If the crash still happens on your real artwork, it is very likely resolution/performance related, not API misuse \u2014 check Test 4's stage timings above and compare against your real document size."
    );
    setStatus("Diagnostics: all tests passed", "success");
  } else {
    diagLog(
      "Test 4 failed \u2014 the basic API works (Tests 1\u20133 passed) but the real halftone algorithm's output triggers a failure."
    );
    setStatus("Diagnostics: Test 4 failed", "error");
  }
}
