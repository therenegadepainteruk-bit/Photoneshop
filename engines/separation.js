/**
 * engines/separation.js — True channel splitting for the Colours tab.
 * Detects N dominant colours via k-means, creates one real Photoshop layer
 * per colour (masked + filled with that colour, not grayscale), grouped
 * under "ColoursReduce". Colours are editable live via the channel editor UI.
 *
 * Uses imaging.getPixels/putPixels directly (the same API already proven
 * reliable elsewhere in this codebase) rather than uncertain Action Manager
 * descriptors for Color Range selection.
 */

const COLOR_NAMES = [
  { name: "Black", r: 0, g: 0, b: 0 },
  { name: "White", r: 255, g: 255, b: 255 },
  { name: "Cyan", r: 0, g: 174, b: 239 },
  { name: "Magenta", r: 236, g: 0, b: 140 },
  { name: "Yellow", r: 255, g: 241, b: 0 },
  { name: "Red", r: 237, g: 28, b: 36 },
  { name: "Green", r: 0, g: 166, b: 81 },
  { name: "Blue", r: 46, g: 49, b: 146 },
  { name: "Orange", r: 247, g: 148, b: 29 },
  { name: "Purple", r: 146, g: 39, b: 143 },
  { name: "Navy", r: 0, g: 32, b: 96 },
  { name: "Grey", r: 128, g: 128, b: 128 },
  { name: "Brown", r: 139, g: 69, b: 19 },
  { name: "Pink", r: 255, g: 192, b: 203 },
];
function nearestColorName(r, g, b) {
  let best = "Colour",
    bestD = Infinity;
  COLOR_NAMES.forEach(function (c) {
    const d = (r - c.r) * (r - c.r) + (g - c.g) * (g - c.g) + (b - c.b) * (b - c.b);
    if (d < bestD) {
      bestD = d;
      best = c.name;
    }
  });
  return best;
}

// Pure-JS k-means on opaque pixels only. No Photoshop calls — fully testable in isolation.
function kMeansColors(buf, comps, k, maxIter) {
  const pts = [];
  for (let i = 0; i < buf.length; i += comps) {
    const a = comps >= 4 ? buf[i + 3] : 255;
    if (a < 10) continue;
    pts.push([buf[i], buf[i + 1] || 0, buf[i + 2] || 0]);
  }
  if (pts.length === 0) return [];
  k = Math.min(k, pts.length);
  const sorted = pts.slice().sort(function (a, b) {
    return a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]);
  });
  let centroids = [];
  for (let c = 0; c < k; c++) {
    const idx = Math.min(sorted.length - 1, Math.floor(((c + 0.5) / k) * sorted.length));
    centroids.push(sorted[idx].slice());
  }
  let assign = new Array(pts.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let p = 0; p < pts.length; p++) {
      let best = 0,
        bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = pts[p][0] - centroids[c][0],
          dg = pts[p][1] - centroids[c][1],
          db = pts[p][2] - centroids[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[p] !== best) {
        assign[p] = best;
        changed = true;
      }
    }
    const sums = [];
    for (let c = 0; c < k; c++) sums.push([0, 0, 0, 0]);
    for (let p = 0; p < pts.length; p++) {
      const c = assign[p];
      sums[c][0] += pts[p][0];
      sums[c][1] += pts[p][1];
      sums[c][2] += pts[p][2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++)
      if (sums[c][3] > 0) centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
    if (!changed) break;
  }
  return centroids.map(function (c) {
    return { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]) };
  });
}

let _channelLayers = []; // [{id, name, color:{r,g,b}, alpha:Uint8ClampedArray, w, h, fullW, fullH}]
const SPLIT_MAX_DIM = 1200; // resolution cap for colour DETECTION only — keeps k-means responsive

// Builds a colour+alpha layer from an alpha mask computed at scan resolution (w×h),
// then upscales to the document's real resolution (fullW×fullH) before writing —
// fullW/fullH are optional so any pre-existing caller that truly wants scan-resolution
// output keeps working unchanged. Without this, a mask computed at the (deliberately
// downscaled, for k-means speed) scan size was being written as-is: on any document
// larger than SPLIT_MAX_DIM the result only filled a small corner of the canvas
// instead of the whole image. Upscale uses nearest-neighbour (engines/halftone.js) —
// same approach already used for live halftone preview, appropriate here since we're
// scaling a mostly-flat alpha mask, not fine detail.
async function writeChannelLayer(layerId, col, alpha, w, h, fullW, fullH) {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    buf[p] = col.r;
    buf[p + 1] = col.g;
    buf[p + 2] = col.b;
    buf[p + 3] = alpha[i];
  }
  const needsUpscale = fullW && fullH && (fullW !== w || fullH !== h);
  const out = needsUpscale ? upscaleNearest(buf, w, h, fullW, fullH) : buf; // upscaleNearest: engines/halftone.js
  const outW = fullW || w,
    outH = fullH || h;
  const imgData = await window.imaging.createImageDataFromBuffer(out, {
    width: outW,
    height: outH,
    components: 4,
    colorSpace: "RGB",
  });
  await window.imaging.putPixels({
    layerID: layerId,
    imageData: imgData,
    targetBounds: { left: 0, top: 0, right: outW, bottom: outH },
  });
  if (imgData.dispose) imgData.dispose();
}

async function splitChannels() {
  if (!guard()) return;
  try {
    const n = parseInt(activeChip("#colorChips", "colors", "4"), 10);
    setStatus("Splitting into " + n + " colour channels…", "info");
    const doc = window.app.activeDocument;
    const longEdge = Math.max(doc.width, doc.height);
    const scanDim = Math.min(SPLIT_MAX_DIM, longEdge);
    const w = doc.width >= doc.height ? scanDim : Math.round((scanDim * doc.width) / doc.height);
    const h = doc.height >= doc.width ? scanDim : Math.round((scanDim * doc.height) / doc.width);

    // Single executeAsModal scope for the whole action (was 3 separate modal
    // calls — sample source, optional early-cleanup, build channel layers —
    // which fragmented one button click into 2 separate Photoshop history/
    // undo entries on the happy path). kMeansColors is a short, pure-JS
    // computation on an already-downscaled buffer, not a Photoshop call, so
    // running it inside this same scope doesn't hold up anything real.
    let centroidCount = 0;
    _channelLayers = [];
    await modal("Photoneshop: split into colour layers", async function () {
      // Read the merged, currently-visible composite straight from the Imaging
      // API (same "no layerID" composite read already trusted elsewhere in this
      // codebase — core/history.js samplePixelStats(), engines/vintage.js
      // autoDetectThreshold(), ai/analysis.js runDeepAnalysis()) instead of
      // paying for a mergeVisible+duplicate stamp layer just to immediately read
      // and discard it. Same pixels (Photoshop's own composite render), no extra
      // full-resolution layer ever materialised — faster and lighter on large,
      // many-layer documents, and one less create+hide+delete round trip.
      const px = await window.imaging.getPixels({ targetSize: { width: w, height: h } });
      const buf = await px.imageData.getData();
      const comps = px.imageData.components;
      px.imageData.dispose();

      const centroids = kMeansColors(buf, comps, n, 8);
      centroidCount = centroids.length;
      if (centroids.length === 0) return;

      for (let c = 0; c < centroids.length; c++) {
        const col = centroids[c];
        const alpha = new Uint8ClampedArray(w * h);
        for (let p = 0, px2 = 0; px2 < w * h; p += comps, px2++) {
          const a = comps >= 4 ? buf[p + 3] : 255;
          if (a < 10) {
            alpha[px2] = 0;
            continue;
          }
          let best = 0,
            bestD = Infinity;
          for (let cc = 0; cc < centroids.length; cc++) {
            const dr = buf[p] - centroids[cc].r,
              dg = (buf[p + 1] || 0) - centroids[cc].g,
              db = (buf[p + 2] || 0) - centroids[cc].b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) {
              bestD = d;
              best = cc;
            }
          }
          alpha[px2] = best === c ? a : 0;
        }
        const name = nearestColorName(col.r, col.g, col.b);
        const layerId = await bpCreateLayer([
          { _obj: "make", _target: [{ _ref: "layer" }], using: { _obj: "layer", name: name } },
        ]);
        await writeChannelLayer(layerId, col, alpha, w, h, doc.width, doc.height);
        await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }] }]).catch(function () {});
        await groupSelectedInto("ColoursReduce");
        _channelLayers.push({
          id: layerId,
          name: name,
          color: col,
          alpha: alpha,
          w: w,
          h: h,
          fullW: doc.width,
          fullH: doc.height,
        });
      }
    });

    if (centroidCount === 0) {
      setStatus("No opaque pixels found to split", "warning");
      return;
    }

    recordAction("group", "ColoursReduce");
    renderChannelEditor();
    setStatus(
      "Split into " +
        centroidCount +
        " colour layers" +
        (longEdge > SPLIT_MAX_DIM ? " (processed at " + scanDim + "px)" : ""),
      "success"
    );
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

async function recolorChannel(idx, hex) {
  const ch = _channelLayers[idx];
  if (!ch) return;
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  ch.color = { r: r, g: g, b: b };
  try {
    await modal("Photoneshop: recolour", async function () {
      await writeChannelLayer(ch.id, ch.color, ch.alpha, ch.w, ch.h, ch.fullW, ch.fullH);
    });
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

function renderChannelEditor() {
  const container = document.getElementById("channelEditor");
  if (!container) return;
  if (_channelLayers.length === 0) {
    container.innerHTML = "";
    return;
  }
  let html = '<div class="grp">Channel Colours — Live Edit</div>';
  _channelLayers.forEach(function (ch, i) {
    const hex =
      "#" +
      [ch.color.r, ch.color.g, ch.color.b]
        .map(function (v) {
          return v.toString(16).padStart(2, "0");
        })
        .join("");
    html +=
      '<div class="channel-row"><input type="color" value="' +
      hex +
      '" data-ch="' +
      i +
      '"><span>' +
      ch.name +
      "</span></div>";
  });
  container.innerHTML = html;
  container.querySelectorAll("input[type=color]").forEach(function (inp) {
    inp.addEventListener("input", function (e) {
      recolorChannel(parseInt(e.target.dataset.ch, 10), e.target.value);
    });
  });
}

/* ============================================================
   AUTO SEPARATE — full pipeline for the Separation tab: detect colour
   channels (CMYK / Spot / Simulated Process), auto-halftone each at a
   rotated screen angle, optional choke, optional registration marks.

   Built from first principles / public-domain prepress convention only —
   NOT derived from any third-party action set or commercial tool:
     - RGB→CMYK: the standard textbook subtractive-colour formula.
     - Screen angles: the classic 4-colour offset/screen-print convention
       (C15° / M75° / Y0° / K45°) used industry-wide for decades specifically
       because each pair differs by 30°/60°/75°, the spacing least prone to
       moiré. Extra spot/sim-process channels beyond 4 cycle through the same
       evenly-spaced angle family rather than repeating one angle everywhere.
     - Choke: reuses the same Photoshop "minimum" filter already used
       elsewhere in this codebase for White Ink choke / halo removal.
   ============================================================ */

const CMYK_ANGLES = { c: 15, m: 75, y: 0, k: 45 };
const ANGLE_CYCLE = [15, 75, 0, 45, 22.5, 67.5];

const SIM_PROCESS_INKS = [
  { name: "Sim White", r: 255, g: 255, b: 255 },
  { name: "Sim Black", r: 20, g: 20, b: 20 },
  { name: "Sim Red", r: 216, g: 30, b: 45 },
  { name: "Sim Yellow", r: 255, g: 214, b: 0 },
  { name: "Sim Blue", r: 0, g: 85, b: 165 },
  { name: "Sim Green", r: 0, g: 140, b: 70 },
];

// Standard subtractive-colour conversion (public-domain formula).
function rgbToCmyk(r, g, b) {
  const rf = r / 255,
    gf = g / 255,
    bf = b / 255;
  const k = 1 - Math.max(rf, gf, bf);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  return { c: (1 - rf - k) / (1 - k), m: (1 - gf - k) / (1 - k), y: (1 - bf - k) / (1 - k), k: k };
}

function nearestSimInk(r, g, b) {
  let best = SIM_PROCESS_INKS[0],
    bestD = Infinity;
  SIM_PROCESS_INKS.forEach(function (ink) {
    const d = (r - ink.r) * (r - ink.r) + (g - ink.g) * (g - ink.g) + (b - ink.b) * (b - ink.b);
    if (d < bestD) {
      bestD = d;
      best = ink;
    }
  });
  return best;
}

// Halftones an already-written colour+alpha channel layer in place, using the
// exact same verified render as the dedicated Halftone tab (engines/halftone.js:
// computeHalftoneBufferChunked / readLayerPixels), at the channel's own ink colour.
async function halftoneChannelLayer(layerId, col, lpi, angle, dpi) {
  const src = await readLayerPixels(layerId);
  const out = await computeHalftoneBufferChunked(
    src.buf,
    src.comps,
    src.w,
    src.h,
    lpi,
    angle,
    0,
    dpi,
    col.r,
    col.g,
    col.b
  );
  const imgData = await window.imaging.createImageDataFromBuffer(out, {
    width: src.w,
    height: src.h,
    components: 4,
    colorSpace: "RGB",
  });
  await window.imaging.putPixels({
    layerID: layerId,
    imageData: imgData,
    targetBounds: { left: 0, top: 0, right: src.w, bottom: src.h },
  });
  if (imgData.dispose) imgData.dispose();
}

// Shrinks a channel's ink edges inward by chokePx so two abutting colours don't
// leave a visible gap under registration drift. Same Action Manager op ("minimum")
// already used by White Ink choke and Remove White Halos elsewhere in this codebase.
async function chokeChannelLayer(layerId, chokePx) {
  if (chokePx <= 0) return;
  // select+minimum each had their own independent .catch(() => {}) — one
  // continueOnError:true call keeps that tolerance (called once per channel,
  // so this halves the round trips for every separation with a choke set).
  await bp(
    [
      { _obj: "select", _target: [{ _ref: "layer", _id: layerId }] },
      {
        _obj: "minimum",
        radius: { _unit: "pixelsUnit", _value: chokePx },
        preserveShape: { _enum: "preserveShape", _value: "roundness" },
      },
    ],
    { continueOnError: true }
  ).catch(function () {});
}

// Draws simple crosshair registration marks near each corner directly via pixel
// writes (the same imaging.putPixels path already proven throughout this codebase)
// rather than guessing at Action Manager shape/selection descriptors blind.
async function writeRegistrationMarks(layerId, w, h) {
  const buf = new Uint8Array(w * h * 4);
  const size = Math.max(20, Math.round(Math.min(w, h) * 0.025));
  const thick = Math.max(2, Math.round(size / 8));
  const margin = Math.round(size * 0.9);
  const positions = [
    [margin, margin],
    [w - margin, margin],
    [margin, h - margin],
    [w - margin, h - margin],
  ];
  function drawBar(cx0, cy0, cx1, cy1) {
    const x0 = Math.max(0, Math.round(cx0)),
      x1 = Math.min(w, Math.round(cx1));
    const y0 = Math.max(0, Math.round(cy0)),
      y1 = Math.min(h, Math.round(cy1));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 255;
      }
  }
  positions.forEach(function (pos) {
    const cx = pos[0],
      cy = pos[1];
    drawBar(cx - size / 2, cy - thick / 2, cx + size / 2, cy + thick / 2); // horizontal arm
    drawBar(cx - thick / 2, cy - size / 2, cx + thick / 2, cy + size / 2); // vertical arm
  });
  const imgData = await window.imaging.createImageDataFromBuffer(buf, {
    width: w,
    height: h,
    components: 4,
    colorSpace: "RGB",
  });
  await window.imaging.putPixels({
    layerID: layerId,
    imageData: imgData,
    targetBounds: { left: 0, top: 0, right: w, bottom: h },
  });
  if (imgData.dispose) imgData.dispose();
}

async function autoSeparate() {
  if (!guard()) return;
  try {
    const mode = activeChip("#sepChips", "sep", "spot"); // "spot" | "cmyk" | "simprocess"
    const n = parseInt(activeChip("#sepColorChips", "sepcolors", "4"), 10);
    const chokePx = Math.max(0, Math.round(num("sepChoke") / 4));
    const lpi = parseInt(val("lpi"), 10) || 45; // reuse the Halftone tab's LPI setting
    const wantHalftone = chk("sepAutoHalftone");
    const wantReg = chk("sepRegMarks");

    setStatus("Detecting colours…", "info");
    const doc = window.app.activeDocument;
    const dpi = doc.resolution || 300;
    const longEdge = Math.max(doc.width, doc.height);
    const scanDim = Math.min(SPLIT_MAX_DIM, longEdge);
    const w = doc.width >= doc.height ? scanDim : Math.round((scanDim * doc.width) / doc.height);
    const h = doc.height >= doc.width ? scanDim : Math.round((scanDim * doc.height) / doc.width);

    // Single executeAsModal scope for the whole action (was 3 separate modal
    // calls — sample source, optional early-cleanup, build separations —
    // which fragmented one button click into 2 separate Photoshop history/
    // undo entries on the happy path). The CMYK/k-means channel-list build is
    // pure JS on an already-downscaled buffer, not a Photoshop call, so
    // running it inside this same scope doesn't hold up anything real.
    const groupName = "AutoSeparation";
    let channels = [];
    await modal("Photoneshop: auto separate", async function () {
      // Read the merged composite directly (see splitChannels() above for why
      // this replaces a mergeVisible+duplicate stamp layer) — same pixels, no
      // extra full-resolution layer, one less create+hide+delete round trip.
      const px = await window.imaging.getPixels({ targetSize: { width: w, height: h } });
      const buf = await px.imageData.getData();
      const comps = px.imageData.components;
      px.imageData.dispose();

      // ---- build the channel list: [{name, r, g, b, alpha(w*h), angle}] ----
      if (mode === "cmyk") {
        const inkColors = {
          c: { r: 0, g: 174, b: 239 },
          m: { r: 236, g: 0, b: 140 },
          y: { r: 255, g: 241, b: 0 },
          k: { r: 0, g: 0, b: 0 },
        };
        const chanVal = {
          c: new Float32Array(w * h),
          m: new Float32Array(w * h),
          y: new Float32Array(w * h),
          k: new Float32Array(w * h),
        };
        const alphaSrc = new Uint8ClampedArray(w * h);
        for (let p = 0, px2 = 0; px2 < w * h; p += comps, px2++) {
          const a = comps >= 4 ? buf[p + 3] : 255;
          alphaSrc[px2] = a;
          if (a < 10) continue;
          const cmyk = rgbToCmyk(buf[p], buf[p + 1] || 0, buf[p + 2] || 0);
          chanVal.c[px2] = cmyk.c;
          chanVal.m[px2] = cmyk.m;
          chanVal.y[px2] = cmyk.y;
          chanVal.k[px2] = cmyk.k;
        }
        ["c", "m", "y", "k"].forEach(function (ch) {
          const alpha = new Uint8ClampedArray(w * h);
          for (let i = 0; i < w * h; i++) alpha[i] = Math.round(chanVal[ch][i] * alphaSrc[i]);
          channels.push({
            name: ch.toUpperCase(),
            r: inkColors[ch].r,
            g: inkColors[ch].g,
            b: inkColors[ch].b,
            alpha: alpha,
            angle: CMYK_ANGLES[ch],
          });
        });
      } else {
        const centroids = kMeansColors(buf, comps, n, 8);
        if (centroids.length === 0) return;
        channels = centroids.map(function (col, c) {
          const ink =
            mode === "simprocess"
              ? nearestSimInk(col.r, col.g, col.b)
              : { name: nearestColorName(col.r, col.g, col.b), r: col.r, g: col.g, b: col.b };
          const alpha = new Uint8ClampedArray(w * h);
          for (let p = 0, px2 = 0; px2 < w * h; p += comps, px2++) {
            const a = comps >= 4 ? buf[p + 3] : 255;
            if (a < 10) {
              alpha[px2] = 0;
              continue;
            }
            let best = 0,
              bestD = Infinity;
            for (let cc = 0; cc < centroids.length; cc++) {
              const dr = buf[p] - centroids[cc].r,
                dg = (buf[p + 1] || 0) - centroids[cc].g,
                db = (buf[p + 2] || 0) - centroids[cc].b;
              const d = dr * dr + dg * dg + db * db;
              if (d < bestD) {
                bestD = d;
                best = cc;
              }
            }
            alpha[px2] = best === c ? a : 0;
          }
          return {
            name: ink.name,
            r: ink.r,
            g: ink.g,
            b: ink.b,
            alpha: alpha,
            angle: ANGLE_CYCLE[c % ANGLE_CYCLE.length],
          };
        });
      }

      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const layerId = await bpCreateLayer([
          { _obj: "make", _target: [{ _ref: "layer" }], using: { _obj: "layer", name: ch.name } },
        ]);
        await writeChannelLayer(layerId, ch, ch.alpha, w, h, doc.width, doc.height);
        if (wantHalftone) await halftoneChannelLayer(layerId, ch, lpi, ch.angle, dpi);
        if (chokePx > 0) await chokeChannelLayer(layerId, chokePx);
        await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }] }]).catch(function () {});
        await groupSelectedInto(groupName);
      }
      if (wantReg) {
        const regId = await bpCreateLayer([
          { _obj: "make", _target: [{ _ref: "layer" }], using: { _obj: "layer", name: "Registration Marks" } },
        ]);
        await writeRegistrationMarks(regId, doc.width, doc.height);
        await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: regId }] }]).catch(function () {});
        await groupSelectedInto(groupName);
      }
    });

    if (channels.length === 0) {
      setStatus("No opaque pixels found to separate", "warning");
      return;
    }

    recordAction("group", groupName);
    setStatus(
      "Auto-separated: " +
        channels.length +
        " channel" +
        (channels.length === 1 ? "" : "s") +
        (wantHalftone ? ", halftoned" : "") +
        (chokePx > 0 ? ", choked" : "") +
        (wantReg ? ", reg marks" : ""),
      "success"
    );
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}
