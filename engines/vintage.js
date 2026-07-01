/**
 * engines/vintage.js — Design Studio pipeline (threshold + tone + vintage)
 * buildPipeline() reads all sliders and returns a batchPlay command array.
 */

function buildPipeline() {
  const cmds = [];
  const blur = num("blur"),
    exposure = num("exposure"),
    highlight = num("highlight"),
    shadow = num("shadow");
  const bright = num("bright"),
    contrast = num("contrast");
  const fade = num("fade"),
    distress = num("distress"),
    bleed = num("bleed"),
    grain = num("grain");
  const halftone = num("halftone"),
    htSize = num("htSize"),
    htAngle = num("htAngle"),
    dotGain = num("dotGain");
  const effect = val("effect");
  const thresh = parseInt(val("thresh"), 10) || 128;

  // 1. Blur (soften before threshold)
  if (blur > 0) cmds.push(opGaussian(blur / 10));

  // 2. Tone shaping (exposure / shadow / highlight)
  if (exposure !== 0 || shadow !== 0 || highlight !== 0) {
    const ev = exposure / 50;
    const offset = shadow / 1000;
    const gamma = Math.max(0.1, 1 - highlight / 200);
    cmds.push(opExposure(ev, offset, gamma));
  }

  // 3. Brightness / contrast
  if (bright !== 0 || contrast !== 0) cmds.push(opBright(bright, contrast));

  // 4. Vintage fade (lift blacks / reduce contrast)
  if (fade > 0) cmds.push(opBright(fade * 0.15, -fade * 0.4));

  // 5. Print effects (pre-threshold)
  if (effect === "photocopy") cmds.push({ _obj: "photocopy", detail: 12, darkness: 30 });
  if (effect === "newspaper") cmds.push(opHalftone(4, 45));

  // 6. Core threshold
  cmds.push(opThreshold(thresh));

  // 7. Halftone (post-threshold dot texture)
  if (halftone > 0) {
    const radius = Math.max(4, htSize);
    const adjusted = Math.max(4, radius - Math.round(dotGain * 0.3));
    cmds.push(opHalftone(adjusted, htAngle));
  }

  // 8. Ink bleed (post-threshold edge spread)
  if (bleed > 0) cmds.push(opMedian(Math.max(1, Math.round(bleed / 3))));

  // 9. Grain
  if (grain > 0) cmds.push(opNoise(Math.round(grain * 0.25)));

  // 10. Distress (secondary lighter noise pass)
  if (distress > 0) cmds.push(opNoise(Math.round(distress * 0.12)));

  return cmds;
}

// ---- auto-detect optimal threshold (Otsu) ----
async function autoDetectThreshold() {
  if (!guard()) return;
  try {
    setStatus("Analysing histogram…", "info");
    let thr = 128;
    await modal("Auto threshold", async () => {
      const px = await imaging.getPixels({ targetSize: { width: 256, height: 256 } });
      const buf = await px.imageData.getData();
      const comps = px.imageData.components;
      const histo = new Array(256).fill(0);
      for (let i = 0; i < buf.length; i += comps) {
        const g = comps >= 3 ? Math.round(0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]) : buf[i];
        histo[Math.min(255, g)]++;
      }
      px.imageData.dispose();
      // Otsu
      const total = histo.reduce((a, b) => a + b, 0);
      let sum = 0;
      for (let i = 0; i < 256; i++) sum += i * histo[i];
      let sumB = 0,
        wB = 0,
        max = 0;
      for (let i = 0; i < 256; i++) {
        wB += histo[i];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += i * histo[i];
        const mB = sumB / wB,
          mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > max) {
          max = between;
          thr = i;
        }
      }
    });
    setSlider("thresh", thr);
    if (hasDoc()) schedulePreview();
    setStatus("Optimal threshold: " + thr, "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}
