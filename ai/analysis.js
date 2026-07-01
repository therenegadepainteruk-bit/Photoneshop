/**
 * ai/analysis.js — Print Doctor
 * Honest heuristic analysis — no fake AI, real measurable signals.
 */

let _doctorResults = null;

async function runPrintDoctor() {
  if (!guard()) return;
  try {
    setStatus("Analysing artwork…", "info");

    let doc = window.app.activeDocument;
    if (!doc) {
      setStatus("No active document", "error");
      return;
    }

    let res = doc.resolution || 72;
    let w = doc.width || 0;
    let h = doc.height || 0;
    let mode = (doc.mode || "").toString();
    let layerCount = doc.layers ? doc.layers.length : 1;

    let issues = [];
    let warnings = [];
    let info = [];
    let fixes = [];
    let score = 10;

    // 1. RESOLUTION
    if (res < 150) {
      issues.push("Very low resolution (" + res + " DPI) — will print poorly");
      fixes.push("Upscale to 300 DPI before processing");
      score -= 3;
    } else if (res < 300) {
      warnings.push("Low resolution (" + res + " DPI) — 300+ recommended");
      fixes.push("Consider upscaling to 300 DPI");
      score -= 1.5;
    } else {
      info.push("Resolution: " + res + " DPI");
    }

    // 2. COLOUR MODE
    if (mode.indexOf("RGB") === -1) {
      warnings.push("Colour mode is " + mode + " — convert to RGB for DTG/DTF");
      score -= 0.5;
    } else {
      info.push("RGB colour mode");
    }

    // 3. PRINT SIZE
    let printW = Math.round((w / res) * 10) / 10;
    let printH = Math.round((h / res) * 10) / 10;
    info.push("Print size: " + printW + '" × ' + printH + '"');
    if (printW < 2 || printH < 2) {
      warnings.push("Artwork is very small at current resolution");
      score -= 0.5;
    }

    // 4. INK COVERAGE (pixel sample) — shared with the footer's live coverage
    // readout (core/history.js samplePixelStats()), so both agree on what
    // counts as "ink" and neither reimplements the pixel-sampling loop.
    let inkCoverage = 0;
    let colorVariance = 0;
    try {
      const stats = await samplePixelStats(200);
      inkCoverage = stats.inkPct;
      colorVariance = stats.colorCount;
    } catch (e) {
      /* pixel sampling failed — skip coverage */
    }

    if (inkCoverage > 80) {
      warnings.push("Very high ink coverage (" + inkCoverage + "%) — expensive to print");
      fixes.push("Use White Ink → Choke to reduce underbase area");
      score -= 1;
    } else if (inkCoverage > 60) {
      warnings.push("High ink coverage (" + inkCoverage + "%)");
      score -= 0.5;
    } else {
      info.push("Ink coverage: " + inkCoverage + "%");
    }

    // 5. COLOUR COMPLEXITY
    if (colorVariance > 200) info.push("High colour complexity (" + colorVariance + " clusters)");
    else if (colorVariance > 50) info.push("Moderate colour complexity");
    else info.push("Low colour count — suitable for spot print");

    // 6. LAYERS
    if (layerCount > 20) {
      warnings.push("Many layers (" + layerCount + ") — consider flattening unused layers");
      fixes.push("Flatten unused layers before processing");
      score -= 0.5;
    } else {
      info.push(layerCount + " layer(s)");
    }

    // 7. RECOMMENDED METHOD
    let recommended = "DTG Standard";
    if (inkCoverage > 70 && res >= 300) recommended = "DTG Premium Photo";
    else if (colorVariance < 30) recommended = "Screen Print — spot colour";
    else if (res < 200) recommended = "DTF — more forgiving of lower resolution";
    else if (inkCoverage < 40) recommended = "Screen Print or DTG Minimal Ink";

    score = Math.max(1, Math.min(10, score));

    // 8. ESTIMATES
    let area = printW * printH;
    let estMinutes = Math.max(1, Math.round(((area * inkCoverage) / 100) * 0.12 + 0.5));
    let estSecs = Math.round(((((area * inkCoverage) / 100) * 0.12 + 0.5) % 1) * 60) || 10;
    let inkMl = Math.round(((area * inkCoverage) / 100) * 0.8 * 10) / 10;
    let inkCost = "\u00a3" + (Math.round(inkMl * 0.04 * 100) / 100).toFixed(2);

    _doctorResults = {
      score: score,
      issues: issues,
      warnings: warnings,
      info: info,
      fixes: fixes,
      recommended: recommended,
      inkCoverage: inkCoverage,
      colorVariance: colorVariance,
      estMinutes: estMinutes,
      estSecs: estSecs,
      inkMl: inkMl,
      inkCost: inkCost,
    };

    renderPrintDoctor(_doctorResults);
    updateFixAvailability();
    setStatus("Print Doctor: " + score.toFixed(1) + "/10", score >= 8 ? "success" : "warning");
  } catch (e) {
    setStatus("Analysis error: " + (e.message || e), "error");
  }
}

function renderPrintDoctor(r) {
  let scoreEl = document.getElementById("drScore");
  let detailEl = document.getElementById("drDetail");
  let recEl = document.getElementById("drRec");
  if (!scoreEl || !detailEl) return;

  scoreEl.textContent = r.score.toFixed(1);
  scoreEl.style.color = r.score >= 8 ? "var(--fg)" : r.score >= 6 ? "var(--warn)" : "var(--err)";

  let html = "";
  r.issues.forEach(function (i) {
    html += '<div class="dr-row dr-err">\u2715  ' + i + "</div>";
  });
  r.warnings.forEach(function (w) {
    html += '<div class="dr-row dr-warn">\u26a0  ' + w + "</div>";
  });
  r.info.forEach(function (i) {
    html += '<div class="dr-row dr-ok">\u2713  ' + i + "</div>";
  });
  html += '<div class="dr-stats">';
  html +=
    '<div class="dr-stat"><div class="dr-stat-v">' +
    r.estMinutes +
    "m " +
    r.estSecs +
    's</div><div class="dr-stat-l">Est. print</div></div>';
  html +=
    '<div class="dr-stat"><div class="dr-stat-v">' +
    r.inkCoverage +
    '%</div><div class="dr-stat-l">Coverage</div></div>';
  html +=
    '<div class="dr-stat"><div class="dr-stat-v">' + r.inkCost + '</div><div class="dr-stat-l">Est. ink</div></div>';
  html += "</div>";
  detailEl.innerHTML = html;

  if (recEl) {
    recEl.innerHTML =
      '<div class="dr-rec-label">Recommended method</div><div class="dr-rec-val">' + r.recommended + "</div>";
    if (r.fixes.length > 0) {
      recEl.innerHTML += '<div class="dr-fixes-label">Suggested fixes</div>';
      r.fixes.forEach(function (f) {
        recEl.innerHTML += '<div class="dr-fix">' + f + "</div>";
      });
    }
  }
}

/* ============================================================
   QUICK FIXES — acted on directly from Print Doctor results
   ============================================================ */

// Resample document to 300 DPI without changing physical print size
async function fixUpscale() {
  if (!guard()) return;
  try {
    let doc = window.app.activeDocument;
    if (!doc) return;
    if (doc.resolution >= 300) {
      setStatus("Already 300 DPI or higher", "info");
      return;
    }
    setStatus("Upscaling to 300 DPI…", "info");
    let widthIn = doc.width / doc.resolution;
    let heightIn = doc.height / doc.resolution;
    await modal("Photoneshop: upscale", async function () {
      await bp([
        {
          _obj: "imageSize",
          width: { _unit: "distanceUnit", _value: widthIn * 300 },
          height: { _unit: "distanceUnit", _value: heightIn * 300 },
          resolution: { _unit: "densityUnit", _value: 300 },
          interpolationMethod: { _enum: "interpolationType", _value: "automaticInterpolation" },
        },
      ]);
    });
    setStatus("Upscaled to 300 DPI", "success");
    if (_doctorResults) runPrintDoctor();
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

// Resize to specific physical dimensions (inches), keeping current resolution
async function fixResize() {
  if (!guard()) return;
  try {
    let w = parseFloat(val("resizeW"));
    let h = parseFloat(val("resizeH"));
    if (!w && !h) {
      setStatus("Enter a width or height in inches", "warning");
      return;
    }
    setStatus("Resizing…", "info");
    let doc = window.app.activeDocument;
    let ratio = doc.height / doc.width;
    if (w && !h) h = w * ratio;
    if (h && !w) w = h / ratio;
    await modal("Photoneshop: resize", async function () {
      await bp([
        {
          _obj: "imageSize",
          width: { _unit: "distanceUnit", _value: w },
          height: { _unit: "distanceUnit", _value: h },
          constrainProportions: true,
          interpolationMethod: { _enum: "interpolationType", _value: "automaticInterpolation" },
        },
      ]);
    });
    setStatus("Resized to " + w.toFixed(1) + '" × ' + h.toFixed(1) + '"', "success");
    if (_doctorResults) runPrintDoctor();
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

// Auto Tone + Auto Contrast + Auto Color, non-destructively on a stamped layer
async function fixEnhance() {
  if (!guard()) return;
  try {
    setStatus("Auto enhancing…", "info");
    await runNonDestructive(
      "Auto Enhanced",
      [{ _obj: "autoTone" }, { _obj: "autoContrast" }, { _obj: "autoColorCorrection" }],
      "Print Doctor"
    );
    setStatus("Auto enhance applied — new layer", "success");
  } catch (e) {
    // Some PS versions reject one of the three in a single batch; retry individually
    try {
      await modal("Photoneshop: enhance fallback", async function () {
        await stampInGroup("Auto Enhanced", "Print Doctor");
        await bp([{ _obj: "autoTone" }]).catch(function () {});
        await bp([{ _obj: "autoContrast" }]).catch(function () {});
        await bp([{ _obj: "autoColorCorrection" }]).catch(function () {});
      });
      setStatus("Auto enhance applied — new layer", "success");
    } catch (e2) {
      setStatus("Error: " + (e2.message || e2), "error");
    }
  }
}

// Flatten all layers into one
async function fixFlatten() {
  if (!guard()) return;
  try {
    setStatus("Flattening layers…", "info");
    await modal("Photoneshop: flatten", async function () {
      await bp([{ _obj: "flattenImage" }]);
    });
    setStatus("Layers flattened", "success");
    if (_doctorResults) runPrintDoctor();
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

// Enable/disable fix buttons based on current document state
function updateFixAvailability() {
  let doc = hasDoc() ? window.app.activeDocument : null;
  let upBtn = document.getElementById("fixUpscale");
  let flatBtn = document.getElementById("fixFlatten");
  let hint = document.getElementById("fixHint");

  if (!doc) {
    [upBtn, flatBtn].forEach(function (b) {
      if (b) b.disabled = true;
    });
    if (hint) hint.textContent = "Open an image to use Quick Fixes.";
    updateColourModeToggle();
    return;
  }

  let res = doc.resolution || 72;
  let layerCount = doc.layers ? doc.layers.length : 1;

  if (upBtn) {
    upBtn.disabled = res >= 300;
    upBtn.textContent =
      res >= 300 ? "Already 300 DPI (" + res + " DPI)" : "Upscale to 300 DPI (" + res + " \u2192 300)";
  }
  if (flatBtn) {
    flatBtn.disabled = layerCount <= 1;
    flatBtn.textContent = layerCount <= 1 ? "Already flat" : "Flatten " + layerCount + " layers";
  }
  if (hint) hint.textContent = "Fixes update automatically based on your artwork.";
  updateColourModeToggle();
}

/* ============================================================
   DEEP ANALYSIS — high-resolution pixel scan + recommendations
   Honest scope: true single-pixel iteration on a 4000x4000 image
   would freeze Photoshop. We sample at a much higher resolution
   than the quick check (up to ~1.4M pixels vs ~14K) and say so.
   ============================================================ */

let DEEP_SCAN_MAX_DIM = 1200; // long edge cap — keeps scan responsive

function openDeepModal() {
  let m = document.getElementById("deepModal");
  if (m) m.classList.remove("hide");
}
function closeDeepModal() {
  let m = document.getElementById("deepModal");
  if (m) m.classList.add("hide");
}

// Cheap Sobel-proxy edge density — forward-difference gradient against each
// pixel's right and down neighbour. Precomputes every pixel's luminance
// ONCE (a Float64Array of w×h values — double precision, matching JS's
// native number type exactly; a Float32Array would silently round every
// value and change the result) rather than recomputing it inline as this
// loop's own g0/gR/gD — every interior pixel's luminance used to be
// computed up to three times over the course of the scan (once as its own
// g0, once as its left neighbour's gR, once as its top neighbour's gD).
// luminance() is a pure function of the same r,g,b inputs every time, so
// this changes nothing about the values, only how many times each is
// computed — output is bit-identical to the original inline version.
function computeEdgeDensity(buf, comps, w, h) {
  const luma = new Float64Array(w * h);
  for (let y = 0, pi = 0; y < h; y++) {
    for (let x = 0; x < w; x++, pi++) {
      const idx = pi * comps;
      luma[pi] = luminance(buf[idx], buf[idx + 1], buf[idx + 2]);
    }
  }
  let edgeSum = 0,
    edgeSamples = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const pi = y * w + x;
      const g0 = luma[pi],
        gR = luma[pi + 1], // right neighbour
        gD = luma[pi + w]; // down neighbour
      edgeSum += Math.abs(g0 - gR) + Math.abs(g0 - gD);
      edgeSamples++;
    }
  }
  return edgeSamples ? edgeSum / edgeSamples / 255 : 0; // 0..~1
}

async function runDeepAnalysis() {
  if (!guard()) return;
  openDeepModal();
  let body = document.getElementById("deepBody");
  if (body) {
    body.innerHTML =
      '<div class="deep-progress">' +
      '<div class="hint">Scanning artwork at high resolution\u2026</div>' +
      '<sp-progressbar class="deep-progress-bar" id="deepBar" min="0" max="100" progress="0"></sp-progressbar>' +
      "</div>";
  }

  try {
    let doc = window.app.activeDocument;
    let longEdge = Math.max(doc.width, doc.height);
    let scanDim = Math.min(DEEP_SCAN_MAX_DIM, longEdge);
    let scanW = doc.width >= doc.height ? scanDim : Math.round((scanDim * doc.width) / doc.height);
    let scanH = doc.height >= doc.width ? scanDim : Math.round((scanDim * doc.height) / doc.width);

    setBar(15);

    let buf, comps;
    await modal("Photoneshop: deep scan", async function () {
      let px = await window.imaging.getPixels({ targetSize: { width: scanW, height: scanH } });
      buf = await px.imageData.getData();
      comps = px.imageData.components;
      px.imageData.dispose();
    });
    setBar(45);

    let w = scanW,
      h = scanH;
    let pixelsScanned = w * h;

    // ---- histogram + colour + clipping ----
    let histo = new Array(256).fill(0);
    let pureBlack = 0,
      pureWhite = 0;
    let colorSet = {};
    let satWarmCount = 0; // proxy for out-of-CMYK-gamut saturated colours
    let rSum = 0,
      gSum = 0,
      bSum = 0;

    for (let i = 0; i < buf.length; i += comps) {
      let r = buf[i],
        g = buf[i + 1] || 0,
        b = buf[i + 2] || 0;
      let grey = comps >= 3 ? Math.round(luminance(r, g, b)) : r;
      histo[grey]++;
      if (grey <= 2) pureBlack++;
      if (grey >= 253) pureWhite++;
      rSum += r;
      gSum += g;
      bSum += b;

      let key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
      colorSet[key] = (colorSet[key] || 0) + 1;

      // crude out-of-CMYK-gamut proxy: very saturated cyan/green/orange
      let maxC = Math.max(r, g, b),
        minC = Math.min(r, g, b);
      let sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      if (sat > 0.85 && maxC > 180) {
        let isGreenish = g > r && g > b;
        let isCyanish = g > r && b > r && Math.abs(g - b) < 40;
        let isOrangey = r > 200 && g > 100 && g < 200 && b < 80;
        if (isGreenish || isCyanish || isOrangey) satWarmCount++;
      }
    }
    setBar(70);

    // ---- edge density (forward-difference gradient, cheap Sobel proxy) ----
    let edgeDensity = computeEdgeDensity(buf, comps, w, h);
    setBar(90);

    let colorCount = Object.keys(colorSet).length;
    let clipShadow = Math.round((pureBlack / pixelsScanned) * 100);
    let clipHighlight = Math.round((pureWhite / pixelsScanned) * 100);
    let gamutRisk = Math.round((satWarmCount / pixelsScanned) * 100);

    // ---- recommendations ----
    let lpi, angle, pattern, lpiReason;
    if (edgeDensity > 0.18) {
      lpi = 85;
      angle = 22;
      pattern = "Fine round dot";
      lpiReason = "High edge density detected (fine detail, text, or thin lines) — a finer screen preserves it.";
    } else if (edgeDensity > 0.08) {
      lpi = 55;
      angle = 45;
      pattern = "Standard round dot";
      lpiReason = "Moderate detail level — a mid-range screen balances detail and ink lay-down.";
    } else {
      lpi = 45;
      angle = 45;
      pattern = "Bold round dot";
      lpiReason = "Mostly flat/bold areas — a coarser screen prints cleaner with less moiré risk.";
    }

    let colourRec, colourReason;
    if (gamutRisk > 3) {
      colourRec = "Stay in RGB";
      colourReason =
        gamutRisk +
        "% of pixels are highly saturated colours that fall outside typical CMYK gamut. Converting now would dull these — keep RGB for DTG/DTF and only convert if your screen print workflow requires spot/CMYK separations.";
    } else if (colorCount < 40) {
      colourRec = "Safe to convert to CMYK";
      colourReason =
        "Low colour complexity (" +
        colorCount +
        " clusters) with minimal out-of-gamut colour. CMYK conversion should be safe for proofing or process printing.";
    } else {
      colourRec = "RGB recommended";
      colourReason =
        "Colour palette is broad. RGB preserves the widest range for DTG/DTF; convert to CMYK only at final separation if needed.";
    }

    let bandingRisk = "Low";
    let midtoneRange = histo.slice(64, 192);
    let nonZeroMidtones = midtoneRange.filter(function (v) {
      return v > 0;
    }).length;
    if (nonZeroMidtones < 40 && edgeDensity < 0.06) bandingRisk = "Elevated — smooth gradient with few tonal steps";

    let clippingNote = [];
    if (clipShadow > 8) clippingNote.push(clipShadow + "% pure black — shadow detail may be lost");
    if (clipHighlight > 8) clippingNote.push(clipHighlight + "% pure white — highlight detail may be lost");

    setBar(100);

    renderDeepResults({
      scanW: scanW,
      scanH: scanH,
      pixelsScanned: pixelsScanned,
      fullW: doc.width,
      fullH: doc.height,
      edgeDensity: edgeDensity,
      colorCount: colorCount,
      lpi: lpi,
      angle: angle,
      pattern: pattern,
      lpiReason: lpiReason,
      colourRec: colourRec,
      colourReason: colourReason,
      bandingRisk: bandingRisk,
      clippingNote: clippingNote,
      clipShadow: clipShadow,
      clipHighlight: clipHighlight,
      gamutRisk: gamutRisk,
    });
  } catch (e) {
    if (body)
      body.innerHTML = '<p class="hint" style="color:var(--err)">Deep analysis failed: ' + (e.message || e) + "</p>";
  }
}

function setBar(pct) {
  let bar = document.getElementById("deepBar");
  if (bar) bar.progress = pct;
}

function renderDeepResults(r) {
  let body = document.getElementById("deepBody");
  if (!body) return;

  let coveragePct = Math.round((r.pixelsScanned / (r.fullW * r.fullH)) * 100);
  let html = "";

  html +=
    '<p class="hint">Scanned ' +
    r.scanW +
    " \u00d7 " +
    r.scanH +
    " px (" +
    r.pixelsScanned.toLocaleString() +
    " pixels" +
    (coveragePct < 100
      ? ", a high-resolution sample of the full " +
        r.fullW +
        "\u00d7" +
        r.fullH +
        " image \u2014 full pixel-by-pixel scanning on large files would freeze Photoshop"
      : ", full resolution") +
    ").</p>";

  html +=
    '<div class="deep-section"><div class="deep-label">Recommended Halftone</div>' +
    '<div class="deep-rec"><div class="deep-rec-title">' +
    r.pattern +
    " \u2014 " +
    r.lpi +
    " LPI at " +
    r.angle +
    "\u00b0</div>" +
    '<div class="deep-rec-sub">' +
    r.lpiReason +
    "</div></div>" +
    '<sp-button variant="secondary" id="applyDeepHalftone" style="margin-top:6px;">Apply these halftone settings</sp-button>' +
    "</div>";

  html +=
    '<div class="deep-section"><div class="deep-label">Recommended Colour Mode</div>' +
    '<div class="deep-rec"><div class="deep-rec-title">' +
    r.colourRec +
    "</div>" +
    '<div class="deep-rec-sub">' +
    r.colourReason +
    "</div></div>" +
    "</div>";

  html += '<div class="deep-section"><div class="deep-label">Pixel-Level Findings</div>';
  if (r.clippingNote.length === 0 && r.bandingRisk === "Low") {
    html += '<div class="deep-row">No major tonal issues detected.</div>';
  }
  r.clippingNote.forEach(function (n) {
    html += '<div class="deep-row warn">\u26a0 ' + n + "</div>";
  });
  if (r.bandingRisk !== "Low") html += '<div class="deep-row warn">\u26a0 Banding risk: ' + r.bandingRisk + "</div>";
  html += "</div>";

  html +=
    '<div class="deep-stats-grid">' +
    '<div class="deep-stat"><div class="deep-stat-v">' +
    (r.edgeDensity * 100).toFixed(1) +
    '%</div><div class="deep-stat-l">Edge density</div></div>' +
    '<div class="deep-stat"><div class="deep-stat-v">' +
    r.colorCount +
    '</div><div class="deep-stat-l">Colour clusters</div></div>' +
    '<div class="deep-stat"><div class="deep-stat-v">' +
    r.clipShadow +
    '%</div><div class="deep-stat-l">Shadow clip</div></div>' +
    '<div class="deep-stat"><div class="deep-stat-v">' +
    r.clipHighlight +
    '%</div><div class="deep-stat-l">Highlight clip</div></div>' +
    "</div>";

  body.innerHTML = html;

  bind("applyDeepHalftone", function () {
    setSlider("lpi", r.lpi);
    setSlider("htAngle", r.angle);
    setStatus("Halftone settings applied \u2014 view on the Halftone tab", "success");
    closeDeepModal();
  });
}

/* ============================================================
   COLOUR MODE TOGGLE (RGB / CMYK) — replaces old Convert to RGB
   ============================================================ */
async function setColourMode(mode) {
  if (!guard()) return;
  try {
    setStatus("Converting to " + mode + "…", "info");
    await modal("Photoneshop: colour mode", async function () {
      await bp([
        {
          _obj: "convertMode",
          to: { _enum: "colorSpace", _value: mode === "CMYK" ? "CMYKColorMode" : "RGBColorMode" },
        },
      ]);
    });
    setStatus("Converted to " + mode, "success");
    updateColourModeToggle();
    if (_doctorResults) runPrintDoctor();
  } catch (e) {
    setStatus("Error: " + (e.message || e), "error");
  }
}

// RGB/CMYK is a 2-way exclusive choice (not a boolean), so it's a chip pair
// (sp-action-button, .selected property) rather than a single sp-switch.
function updateColourModeToggle() {
  let rgbBtn = document.getElementById("toggleRGB");
  let cmykBtn = document.getElementById("toggleCMYK");
  if (!rgbBtn || !cmykBtn) return;
  if (!hasDoc()) {
    rgbBtn.selected = false;
    cmykBtn.selected = false;
    return;
  }
  let mode = (window.app.activeDocument.mode || "").toString();
  let isCMYK = mode.indexOf("CMYK") !== -1;
  rgbBtn.selected = !isCMYK;
  cmykBtn.selected = isCMYK;
}

// Feeds the Production Centre tab (tab 12) with the same analysis
async function runProductionCheck() {
  if (!hasDoc()) {
    setStatus("Open an image in Photoshop first", "warning");
    return;
  }
  await runPrintDoctor();
  if (!_doctorResults) return;
  let scoreEl = document.getElementById("prodScore");
  let detailEl = document.getElementById("prodDetail");
  let r = _doctorResults;
  if (scoreEl) {
    scoreEl.textContent = r.score.toFixed(1);
    scoreEl.style.color = r.score >= 8 ? "var(--fg)" : r.score >= 6 ? "var(--warn)" : "var(--err)";
  }
  if (detailEl) {
    let html = "";
    r.issues.forEach(function (i) {
      html += '<span style="color:var(--err)">\u2715 ' + i + "</span><br>";
    });
    r.warnings.forEach(function (w) {
      html += '<span style="color:var(--warn)">\u26a0 ' + w + "</span><br>";
    });
    r.info.forEach(function (i) {
      html += "<span>\u2713 " + i + "</span><br>";
    });
    detailEl.innerHTML = html;
  }
}
