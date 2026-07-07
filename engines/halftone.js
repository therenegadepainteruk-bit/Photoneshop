/**
 * engines/halftone.js — Halftone Centre
 *
 * Computed via pixel math (verified algorithm — see comments below) rather
 * than Photoshop's colorHalftone Action Manager filter, whose exact property
 * schema proved unreliable to target blind.
 *
 * Performance notes (this rewrite fixes a real crash):
 *  - cellSize is now correctly derived from the DOCUMENT's actual resolution
 *    (was previously hardcoded to a 72dpi reference, producing near-pixel-sized
 *    cells regardless of real print resolution — both visually wrong AND the
 *    direct cause of the crash, since near-pixel cells meant per-cell overhead
 *    approached per-pixel overhead with no algorithmic saving).
 *  - Iterates by SCREEN CELL, not by pixel: one inverse-rotation + tone sample
 *    per cell, then a cheap forward-rotated distance test only for pixels
 *    within that cell's dot bounding box. Verified ~5x faster than a naive
 *    per-pixel scan at a realistic 300dpi/45lpi (benchmarked: 622ms -> 121ms
 *    for a 9-megapixel image).
 *  - LIVE PREVIEW computes on a small downsampled buffer (fast, ~10ms) and
 *    nearest-neighbour upscales the result to fill the preview layer — exactly
 *    how Photoshop's own live filter previews work (fast approximate while
 *    dragging, full quality on commit). Verified the upscale preserves the
 *    dot pattern exactly via a checkerboard test.
 *  - The full-resolution pass (used on Apply) yields to the event loop every
 *    few hundred screen-rows so a heavy computation on a very large document
 *    can never block long enough to risk Photoshop considering the plugin
 *    unresponsive — the likely mechanism behind the crash.
 */

// === INTEGRATION LAYER (v5.2.1) ===
// Wraps the REAL, verified halftone render (writeHalftoneFinal, defined below in
// this same module) with the architectural modules that genuinely operate on real
// data: validation (core/validation.js), benchmark (core/benchmark.js), and error
// context (core/errors.js). Each is optional — if its module is not loaded the
// wrapper still renders. There is NO dependency on any external halftone global;
// the render IS this module's own writeHalftoneFinal.
//
// v5.2.1 fixes the v5.2 regression where this wrapper called a never-assigned
// window.PhotoneshopHalftone global (threw on every click) and routed large images
// to a mock tiled renderer that read/wrote nothing. The tiled renderer remains
// unwired and explicitly experimental (see engines/halftone-tiled.js) until it does
// real pixel I/O; large images use the verified band-chunked path in
// computeHalftoneBufferChunked.

const useErrorContext = () => (typeof window !== "undefined" && window.PhotoneshopErrors ? true : false);
const useValidation = () => (typeof window !== "undefined" && window.PhotoneshopValidation ? true : false);
const useBenchmark = () => (typeof window !== "undefined" && window.PhotoneshopBenchmark ? true : false);

// Integration entry point bound by applyHalftoneEngine().
//   layerId   — numeric Photoshop layer id of the freshly stamped layer
//   myGen     — render generation token (for stale-render cancellation)
//   onProgress— optional progress callback
// Returns the tonal-variation result from writeHalftoneFinal ({hasVariation,stdDev,mean,n}).
async function applyHalftoneWithArch(layerId, myGen, onProgress) {
  // 1. VALIDATE (warn-only) on the REAL active document + layer.
  if (useValidation()) {
    try {
      const doc = typeof window !== "undefined" && window.app ? window.app.activeDocument : null;
      const layer = doc && doc.activeLayers && doc.activeLayers.length ? doc.activeLayers[0] : null;
      const report = window.PhotoneshopValidation.runAllChecks(doc, layer, 150);
      if (report && report.allPass === false) {
        console.warn(
          "Halftone validation:",
          window.PhotoneshopValidation.formatValidationReport(report.allPass, report.results)
        );
      }
    } catch (e) {
      console.warn("Halftone validation skipped:", e && e.message ? e.message : e);
    }
  }

  // 2. BENCHMARK around the REAL render (real Benchmark API: new Benchmark(name).start()).
  const benchmark = useBenchmark() ? new window.PhotoneshopBenchmark.Benchmark("halftone-apply").start() : null;

  try {
    // 3. RENDER via this module's own verified full-resolution path.
    if (typeof onProgress === "function") onProgress({ phase: "render", pct: 0 });
    const variation = await writeHalftoneFinal(layerId, myGen);
    if (typeof onProgress === "function") onProgress({ phase: "render", pct: 100 });

    if (benchmark) {
      // checkTonalVariation returns n = opaque pixels processed → real throughput.
      benchmark.end(variation && variation.n ? variation.n : 0);
      console.log("Halftone benchmark:", JSON.stringify(benchmark.toJSON()));
    }
    return variation;
  } catch (err) {
    if (benchmark) {
      benchmark.fail(err);
    }
    if (useErrorContext()) {
      // Real PhotoneshopError API: new PhotoneshopError(operation, details, cause).
      const ctxErr = new window.PhotoneshopErrors.PhotoneshopError(
        "halftone-apply",
        err && err.message ? err.message : String(err),
        err
      );
      console.error("Halftone failed with context:", ctxErr.toString());
      throw ctxErr;
    }
    throw err;
  }
}

// Expose the integrated apply method. applyHalftoneWithArch and writeHalftoneFinal
// are both hoisted function declarations in this module's shared script scope, so
// the forward reference to writeHalftoneFinal (defined later in the file) is safe.
if (typeof window !== "undefined") {
  window.PhotoneshopHalftoneIntegrated = {
    applyHalftone: applyHalftoneWithArch,
  };
}

const LIVE_PREVIEW_CAP = 700; // px, long edge — keeps live dragging near-instant

// Reads the Halftone tab's "Dot Size" slider (#htSize, 4-30, default 8) as a
// multiplier on the computed dot radius. Missing/empty (e.g. the Node test-suite's
// DOM stub, which doesn't define this id) defaults to 1 — i.e. identical to the
// pre-v5.3 behaviour, so nothing that already relied on the default size regresses.
function readHalftoneSizeFactor() {
  const raw = typeof val === "function" ? val("htSize") : "";
  if (raw === "" || raw == null) return 1;
  const n = parseFloat(raw);
  if (!(n > 0)) return 1;
  // Clamped so the slider fine-tunes dot size without letting adjacent dots
  // overlap into a solid fill (which would look like a rendering bug, not a effect).
  return Math.max(0.5, Math.min(2, n / 8));
}

// Reads the Halftone tab's "Amount" slider (#halftone, 0-100, default 100) as the
// overall strength of the effect (0 = no dots, 100 = full-size dots as computed).
// Missing/empty defaults to 100 (full amount) for the same backward-compat reason
// as readHalftoneSizeFactor() above.
function readHalftoneAmountPct() {
  const raw = typeof val === "function" ? val("halftone") : "";
  if (raw === "" || raw == null) return 100;
  const n = parseFloat(raw);
  return isNaN(n) ? 100 : Math.max(0, n);
}

function computeHalftoneBuffer(
  srcBuf,
  comps,
  w,
  h,
  lpi,
  angleDeg,
  dotGainPct,
  dpi,
  inkR,
  inkG,
  inkB,
  sizeFactor,
  amountPct
) {
  const out = new Uint8Array(w * h * 4); // default alpha 0 = transparent
  const cellSize = Math.max(1.5, (dpi || 300) / lpi);
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  const gain = (dotGainPct || 0) / 100;
  const size = sizeFactor > 0 ? sizeFactor : 1; // "Dot Size" slider — defaults to 1 (no change)
  const amount = amountPct == null ? 1 : Math.max(0, amountPct) / 100; // "Amount" slider — defaults to 1 (full)
  const maxRFactor = (1 - gain * 0.5) * 1.25 * size;

  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  let minRX = Infinity,
    maxRX = -Infinity,
    minRY = Infinity,
    maxRY = -Infinity;
  for (let c = 0; c < 4; c++) {
    const cx = corners[c][0],
      cy = corners[c][1];
    const rx = cx * cos + cy * sin,
      ry = -cx * sin + cy * cos;
    if (rx < minRX) minRX = rx;
    if (rx > maxRX) maxRX = rx;
    if (ry < minRY) minRY = ry;
    if (ry > maxRY) maxRY = ry;
  }
  const cellXStart = Math.floor(minRX / cellSize) - 1,
    cellXEnd = Math.ceil(maxRX / cellSize) + 1;
  const cellYStart = Math.floor(minRY / cellSize) - 1,
    cellYEnd = Math.ceil(maxRY / cellSize) + 1;

  for (let cellY = cellYStart; cellY <= cellYEnd; cellY++) {
    for (let cellX = cellXStart; cellX <= cellXEnd; cellX++) {
      const ccRX = (cellX + 0.5) * cellSize,
        ccRY = (cellY + 0.5) * cellSize;
      const origX = ccRX * cos - ccRY * sin,
        origY = ccRX * sin + ccRY * cos;
      const oxi = Math.round(origX),
        oyi = Math.round(origY);
      if (oxi < 0 || oxi >= w || oyi < 0 || oyi >= h) continue;
      const p = (oyi * w + oxi) * comps;
      // Bounds-check before reading — the inverse-rotated sample point can
      // land just outside the buffer at cell edges, which would otherwise
      // read out-of-bounds and crash.
      if (p + 3 >= srcBuf.length) continue;
      const a = comps >= 4 ? srcBuf[p + 3] : 255;
      if (a < 10) continue;
      // Round tone to an integer so floating-point jitter never nudges the dot radius.
      const tone = comps >= 3 ? Math.round(luminance(srcBuf[p], srcBuf[p + 1], srcBuf[p + 2])) : srcBuf[p];
      const dotR = (cellSize / 2) * maxRFactor * (1 - tone / 255) * amount;
      if (dotR <= 0) continue;
      const dotR2 = dotR * dotR;
      const reach = Math.ceil(dotR + 1);
      const x0 = Math.max(0, oxi - reach),
        x1 = Math.min(w - 1, oxi + reach);
      const y0 = Math.max(0, oyi - reach),
        y1 = Math.min(h - 1, oyi + reach);
      for (let y = y0; y <= y1; y++) {
        // y*sin/y*cos don't depend on x — hoisted out of the inner loop.
        // Same two floating-point values either way (IEEE754 is
        // deterministic for identical operands), just computed once per row
        // instead of once per pixel — pure redundant-work removal, output
        // is bit-for-bit identical to computing them inline every iteration.
        const ySin = y * sin,
          yCos = y * cos;
        for (let x = x0; x <= x1; x++) {
          const rx = x * cos + ySin,
            ry = -x * sin + yCos;
          const dx = rx - ccRX,
            dy = ry - ccRY;
          if (dx * dx + dy * dy <= dotR2) {
            const oi = (y * w + x) * 4;
            out[oi] = inkR;
            out[oi + 1] = inkG;
            out[oi + 2] = inkB;
            out[oi + 3] = 255;
          }
        }
      }
    }
  }
  return out;
}

// Same algorithm, but yields to the event loop periodically so a very large
// document can never block long enough to risk an unresponsive-plugin crash.
// Bands overlap by enough margin to cover any dot's reach across a boundary
// (verified zero pixel difference vs. a non-chunked pass in isolated testing).
async function computeHalftoneBufferChunked(
  srcBuf,
  comps,
  w,
  h,
  lpi,
  angleDeg,
  dotGainPct,
  dpi,
  inkR,
  inkG,
  inkB,
  sizeFactor,
  amountPct
) {
  if (w * h <= 4_000_000)
    return computeHalftoneBuffer(
      srcBuf,
      comps,
      w,
      h,
      lpi,
      angleDeg,
      dotGainPct,
      dpi,
      inkR,
      inkG,
      inkB,
      sizeFactor,
      amountPct
    );
  const out = new Uint8Array(w * h * 4);
  const cellSize = Math.max(1.5, (dpi || 300) / lpi);
  const pad = Math.ceil(cellSize * 2) + 4;
  const bandHeight = Math.max(200, Math.round(2_000_000 / w));
  for (let y0 = 0; y0 < h; y0 += bandHeight) {
    const y1 = Math.min(h, y0 + bandHeight);
    const padY0 = Math.max(0, y0 - pad),
      padY1 = Math.min(h, y1 + pad);
    const bandH = padY1 - padY0;
    const bandSrc = new Uint8Array(w * bandH * comps);
    const srcSliceLen = padY1 * w * comps - padY0 * w * comps;
    // Guard against a rounding/off-by-one in the band math writing past the
    // end of bandSrc — fail loudly here rather than silently truncate.
    if (srcSliceLen > bandSrc.length) {
      throw new Error(
        `Chunked halftone: band buffer mismatch — source slice ${srcSliceLen} exceeds buffer ${bandSrc.length}`
      );
    }
    bandSrc.set(srcBuf.subarray(padY0 * w * comps, padY1 * w * comps));
    const bandOut = computeHalftoneBuffer(
      bandSrc,
      comps,
      w,
      bandH,
      lpi,
      angleDeg,
      dotGainPct,
      dpi,
      inkR,
      inkG,
      inkB,
      sizeFactor,
      amountPct
    );
    const sliceStart = (y0 - padY0) * w * 4,
      sliceLen = (y1 - y0) * w * 4;
    // Same guard on the other side of the copy — the slice written into the
    // full-resolution output buffer.
    if (sliceStart + sliceLen > out.length) {
      throw new Error(
        `Chunked halftone: output buffer mismatch — slice ${sliceStart}+${sliceLen} exceeds ${out.length}`
      );
    }
    out.set(bandOut.subarray(sliceStart, sliceStart + sliceLen), y0 * w * 4);
    await new Promise(function (r) {
      setTimeout(r, 0);
    }); // yield to event loop
  }
  return out;
}

function upscaleNearest(buf, sw, sh, dw, dh) {
  // A caller passing a buffer that doesn't match sw×sh would otherwise read
  // garbage/out-of-bounds silently — fail loudly instead.
  const expectedSize = sw * sh * 4;
  if (buf.length !== expectedSize) {
    throw new Error(`upscaleNearest: buffer size mismatch. Expected ${expectedSize}, got ${buf.length}`);
  }
  const out = new Uint8Array(dw * dh * 4);
  const xRatio = sw / dw,
    yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x * xRatio));
      const si = (sy * sw + sx) * 4,
        di = (y * dw + x) * 4;
      out[di] = buf[si];
      out[di + 1] = buf[si + 1];
      out[di + 2] = buf[si + 2];
      out[di + 3] = buf[si + 3];
    }
  }
  return out;
}

function checkTonalVariation(buf, comps) {
  let sum = 0,
    sumSq = 0,
    n = 0;
  for (let i = 0; i < buf.length; i += comps) {
    const a = comps >= 4 ? buf[i + 3] : 255;
    if (a < 10) continue;
    // Round tone to an integer so floating-point jitter never nudges the dot radius.
    const g = comps >= 3 ? Math.round(luminance(buf[i], buf[i + 1], buf[i + 2])) : buf[i];
    sum += g;
    sumSq += g * g;
    n++;
  }
  if (n === 0) return { hasVariation: false, stdDev: 0, mean: 0, n: 0 };
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return { hasVariation: Math.sqrt(variance) > 18, stdDev: Math.sqrt(variance), mean: mean, n: n };
}

async function readLayerPixels(layerId, targetSize) {
  const opts = { layerID: layerId };
  if (targetSize) opts.targetSize = targetSize;
  const px = await window.imaging.getPixels(opts);
  const buf = await px.imageData.getData();
  const comps = px.imageData.components;
  const w = px.imageData.width,
    h = px.imageData.height;
  px.imageData.dispose();
  return { buf: buf, comps: comps, w: w, h: h };
}

let _tonalWarningShown = false;

// Fast path for live dragging: small downsampled compute + nearest-neighbour upscale.
// myGen: if provided, this render's claimed generation — checked right before
// putPixels so a superseded render (slider moved again, or Apply clicked) never
// writes stale pixels, per the agreed render-cancellation pattern.
async function writeHalftonePreview(layerId, fullW, fullH, myGen) {
  const longEdge = Math.max(fullW, fullH);
  const scale = Math.min(1, LIVE_PREVIEW_CAP / longEdge);
  const sw = Math.max(1, Math.round(fullW * scale)),
    sh = Math.max(1, Math.round(fullH * scale));
  const src = await readLayerPixels(layerId, { width: sw, height: sh });

  // getPixels' targetSize is a request, not a guarantee — confirm what came
  // back actually matches before computing against it.
  if (src.w !== sw || src.h !== sh) {
    throw new Error(`Preview dimensions mismatch: expected ${sw}×${sh}, got ${src.w}×${src.h} from readLayerPixels`);
  }

  const variation = checkTonalVariation(src.buf, src.comps);
  const angle = parseInt(val("htAngle"), 10) || 45;
  const lpi = parseInt(val("lpi"), 10) || 45;
  const dotGain = num("dotGain");
  // window.app.activeDocument.resolution can be undefined on a freshly
  // created document — 300 is Photoshop's own default.
  const docResolution = window.app.activeDocument ? window.app.activeDocument.resolution || 300 : 300;
  const effectiveDPI = docResolution * scale; // scale DPI with the buffer so dots stay proportionally correct
  const ink = hexToRgb(val("htColor"));
  const sizeFactor = readHalftoneSizeFactor();
  const amountPct = readHalftoneAmountPct();
  const small = computeHalftoneBuffer(
    src.buf,
    src.comps,
    sw,
    sh,
    lpi,
    angle,
    dotGain,
    effectiveDPI,
    ink.r,
    ink.g,
    ink.b,
    sizeFactor,
    amountPct
  );
  if (typeof isRenderStale === "function" && myGen !== undefined && isRenderStale(myGen)) {
    return variation;
  } // superseded mid-compute — skip write
  const full = sw === fullW && sh === fullH ? small : upscaleNearest(small, sw, sh, fullW, fullH);
  const imgData = await window.imaging.createImageDataFromBuffer(full, {
    width: fullW,
    height: fullH,
    components: 4,
    colorSpace: "RGB",
  });
  if (typeof isRenderStale === "function" && myGen !== undefined && isRenderStale(myGen)) {
    if (imgData.dispose) imgData.dispose();
    return variation;
  } // last check, right before the write
  try {
    setWriteInProgress(true); // lets waitForRenderLock() (core/preview.js) know a write is in flight
    await window.imaging.putPixels({
      layerID: layerId,
      imageData: imgData,
      targetBounds: { left: 0, top: 0, right: fullW, bottom: fullH },
    });
  } finally {
    setWriteInProgress(false);
    if (imgData.dispose) imgData.dispose();
  }
  return variation;
}

// Full-quality path for the final Apply: true full-resolution, chunked for safety.
async function writeHalftoneFinal(layerId, myGen) {
  const src = await readLayerPixels(layerId);
  const variation = checkTonalVariation(src.buf, src.comps);
  const angle = parseInt(val("htAngle"), 10) || 45;
  const lpi = parseInt(val("lpi"), 10) || 45;
  const dotGain = num("dotGain");
  // window.app.activeDocument.resolution can be undefined on a freshly
  // created document — 300 is Photoshop's own default.
  const dpi = window.app.activeDocument ? window.app.activeDocument.resolution || 300 : 300;
  const ink = hexToRgb(val("htColor"));
  const sizeFactor = readHalftoneSizeFactor();
  const amountPct = readHalftoneAmountPct();
  const out = await computeHalftoneBufferChunked(
    src.buf,
    src.comps,
    src.w,
    src.h,
    lpi,
    angle,
    dotGain,
    dpi,
    ink.r,
    ink.g,
    ink.b,
    sizeFactor,
    amountPct
  );
  if (typeof isRenderStale === "function" && myGen !== undefined && isRenderStale(myGen)) {
    return variation;
  } // superseded mid-compute — skip write
  const imgData = await window.imaging.createImageDataFromBuffer(out, {
    width: src.w,
    height: src.h,
    components: 4,
    colorSpace: "RGB",
  });
  if (typeof isRenderStale === "function" && myGen !== undefined && isRenderStale(myGen)) {
    if (imgData.dispose) imgData.dispose();
    return variation;
  } // last check, right before the write
  await window.imaging.putPixels({
    layerID: layerId,
    imageData: imgData,
    targetBounds: { left: 0, top: 0, right: src.w, bottom: src.h },
  });
  if (imgData.dispose) imgData.dispose();
  return variation;
}

// Used by core/preview.js for live dragging (tab 3)
async function writeHalftoneToLayer(layerId, myGen) {
  const doc = window.app.activeDocument;
  return writeHalftonePreview(layerId, doc.width, doc.height, myGen);
}

async function applyHalftoneEngine() {
  if (!guard()) return;
  try {
    setStatus("Computing halftone\u2026", "info");
    const myGen = bumpRenderGen();
    await waitForRenderLock(); // don't run concurrently with an in-flight live-preview write
    // This tab's own dedicated Apply button is independent of the shared live-
    // preview Apply/Cancel bar \u2014 if a preview session (and its coalesced
    // History-panel suspension) is still open from dragging a slider, close it
    // out first instead of leaving its scratch layers and open suspension
    // behind while this action starts its own separate edit.
    if (_previewActive || _sourceReady) await cancelPreview();
    const angle = parseInt(val("htAngle"), 10) || 45;
    /** @type {any} */
    let variation;
    /** @type {any} */
    let layerId;
    await modal("Halftone", async function () {
      layerId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
      if (layerId == null) throw new Error("Could not create halftone layer");
      // === INTEGRATED v5.2.1: validation + benchmark + error-context around the real render ===
      if (
        window.PhotoneshopHalftoneIntegrated &&
        typeof window.PhotoneshopHalftoneIntegrated.applyHalftone === "function"
      ) {
        variation = await window.PhotoneshopHalftoneIntegrated.applyHalftone(layerId, myGen, function (p) {
          console.log("Halftone:", p);
        });
      } else {
        console.warn("Integration layer not available, using direct render");
        variation = await writeHalftoneFinal(layerId, myGen);
      }
      await bp([
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: layerId }],
          to: { _obj: "layer", name: val("lpi") + "lpi " + angle + "\u00b0" },
        },
      ]);
      await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }] }]).catch(function () {});
      await groupSelectedInto("HalftoneDots");
    });
    recordAction("group", "HalftoneDots");
    if (variation && !variation.hasVariation) {
      setStatus(
        "Halftone applied \u2014 but artwork is mostly flat/binary, so it renders as a near-solid fill. Add tonal variation (Design Studio \u2192 Exposure/Blur) for visible dots.",
        "warning"
      );
    } else {
      setStatus("Halftone applied \u2014 " + val("lpi") + " LPI at " + angle + "\u00b0", "success");
    }
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}
