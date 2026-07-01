/**
 * engines/print.js — Production print engines
 * Garment optimiser, White Ink Centre, DTG, DTF, Separation, Colours, Export
 */

// ============================================================
// GARMENT OPTIMISER
// ============================================================
const GARMENT_PROFILES = {
  white: { b: -5, c: 10, under: false },
  black: { b: 20, c: 25, under: true },
  heather: { b: 5, c: 12, under: true },
  navy: { b: 15, c: 20, under: true },
  grey: { b: 8, c: 15, under: true },
  coloured: { b: 8, c: 14, under: true },
};

async function applyGarment() {
  if (!guard()) return;
  try {
    const g = activeChip("#garmentChips", "garment", "white");
    const P = GARMENT_PROFILES[g] || GARMENT_PROFILES.white;
    setStatus("Optimising for " + g + "…", "info");
    await modal("Garment", async () => {
      await stampInGroup("Garment Optimised", "GarmentOptimise");
      await bp([opBright(P.b, P.c)]);
      if (P.under && chk("autoUnderbase")) {
        await bp([
          {
            _obj: "duplicate",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            name: "White Underbase",
          },
        ]);
        await bp([
          {
            _obj: "set",
            _target: [
              { _ref: "property", _property: "preserveTransparency" },
              { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
            ],
            to: true,
          },
        ]).catch(() => {});
        await bp([
          {
            _obj: "fill",
            using: { _enum: "fillContents", _value: "white" },
            opacity: { _unit: "percentUnit", _value: 100 },
            mode: { _enum: "blendMode", _value: "normal" },
          },
        ]).catch(() => {});
        await bp([
          {
            _obj: "move",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _ref: "layer", _enum: "ordinal", _value: "previous" },
          },
        ]).catch(() => {});
      }
    });
    const msg = "Optimised for " + g + (P.under && chk("autoUnderbase") ? " + white underbase" : "");
    setStatus(msg, "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

// ============================================================
// WHITE INK CENTRE
// ============================================================
function buildWhiteInkPipeline() {
  const density = num("wDensity");
  const choke = Math.max(0, Math.round(num("wChoke") / 3));
  const feather = Math.max(0, Math.round(num("wFeather") / 4));
  const hlBoost = num("wHl");
  const cmds = [
    {
      _obj: "set",
      _target: [
        { _ref: "property", _property: "preserveTransparency" },
        { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
      ],
      to: true,
    },
    {
      _obj: "fill",
      using: { _enum: "fillContents", _value: "white" },
      opacity: { _unit: "percentUnit", _value: density },
      mode: { _enum: "blendMode", _value: "normal" },
    },
  ];
  if (choke > 0)
    cmds.push({
      _obj: "minimum",
      radius: { _unit: "pixelsUnit", _value: choke },
      preserveShape: { _enum: "preserveShape", _value: "roundness" },
    });
  if (feather > 0) cmds.push(opGaussian(feather));
  // Highlight Boost — lifts the white layer's own brightness so highlight areas of
  // the underbase lay down denser white ink (was a dead slider; never read here).
  if (hlBoost > 0) cmds.push(opBright(Math.round(hlBoost * 0.3), 0));
  return cmds;
}

async function generateUnderbase() {
  if (!guard()) return;
  try {
    setStatus("Generating white underbase…", "info");
    const density = num("wDensity");
    const choke = Math.max(0, Math.round(num("wChoke") / 3));
    await modal("White Underbase", async () => {
      await stampInGroup("White Underbase", "WhiteInkUnderbase");
      await bp(buildWhiteInkPipeline());
    });
    setStatus(
      "White underbase generated (" + density + "% density, " + (choke ? choke + "px choke" : "no choke") + ")",
      "success"
    );
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

// ============================================================
// COLOUR REDUCTION
// ============================================================
// NOTE: the old posterize-based "reduceColours" (single flattened raster) was
// removed — replaced by splitChannels() in engines/separation.js, which creates
// real per-colour masked layers, named and grouped correctly, with live-editable
// colours. See ui/panels.js binding for "reduceColors" button -> splitChannels.

// ============================================================
// SEPARATION — palette shift + knockout
// ============================================================
const PALETTES = [
  { name: "Mono", dark: [0, 0, 0], light: [255, 255, 255] },
  { name: "Crimson", dark: [26, 26, 46], light: [233, 69, 96] },
  { name: "Ember", dark: [45, 49, 66], light: [239, 131, 84] },
  { name: "Sky", dark: [11, 57, 84], light: [191, 215, 234] },
  { name: "Alarm", dark: [43, 45, 66], light: [217, 4, 41] },
  { name: "Gold", dark: [0, 48, 73], light: [252, 191, 73] },
];
let _paletteIdx = 0;

async function shiftColors() {
  if (!guard()) return;
  try {
    _paletteIdx = (_paletteIdx + 1) % PALETTES.length;
    const pal = PALETTES[_paletteIdx];
    const d = pal.dark,
      l = pal.light;
    await modal("Shift Colours", async () => {
      await stampInGroup("Recoloured " + pal.name, "SeparationRecolour");
      await bp([
        {
          _obj: "gradientMapClass",
          gradientsInterpolationMethod: { _enum: "gradientInterpolationMethodType", _value: "perceptual" },
          type: { _enum: "gradientType", _value: "linear" },
          reverse: false,
          dither: false,
          gradient: {
            _obj: "gradientClassEvent",
            name: pal.name,
            gradientForm: { _enum: "gradientForm", _value: "customStops" },
            interfaceIconFrameDimmed: 4096,
            colors: [
              {
                _obj: "colorStop",
                color: { _obj: "RGBColor", red: d[0], green: d[1], blue: d[2] },
                type: { _enum: "colorStopType", _value: "userStop" },
                location: 0,
                midpoint: 50,
              },
              {
                _obj: "colorStop",
                color: { _obj: "RGBColor", red: l[0], green: l[1], blue: l[2] },
                type: { _enum: "colorStopType", _value: "userStop" },
                location: 4096,
                midpoint: 50,
              },
            ],
            transparency: [
              { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: 0, midpoint: 50 },
              { _obj: "transferSpec", opacity: { _unit: "percentUnit", _value: 100 }, location: 4096, midpoint: 50 },
            ],
          },
        },
      ]);
    });
    setStatus("Palette: " + pal.name + " (" + (_paletteIdx + 1) + "/" + PALETTES.length + ")", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function applyKnockout() {
  if (!guard()) return;
  try {
    await modal("Knockout", async () => {
      await bp([
        {
          _obj: "set",
          _target: [
            { _ref: "property", _property: "layerEffects" },
            { _ref: "layer", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { _obj: "layerEffects", knockout: { _enum: "knockoutType", _value: "deep" } },
        },
      ]).catch(async () => {
        await bp([
          {
            _obj: "set",
            _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
            to: { _obj: "layer", fillOpacity: { _unit: "percentUnit", _value: 0 } },
          },
        ]).catch(() => {});
      });
    });
    setStatus("Knockout applied — underlying ink removed at overlap", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function exportSpots() {
  if (!guard()) return;
  try {
    const folder = await fs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "info");
      return;
    }
    const doc = window.app.activeDocument;
    const base = (doc.name || "art").replace(/\.[^.]+$/, "").trim() || "untitled";
    setStatus("Exporting spot channels…", "info");
    await modal("Spot Export", async () => {
      await bp([
        {
          _obj: "duplicate",
          _target: [{ _ref: "document", _enum: "ordinal", _value: "first" }],
          name: base + "_spots",
        },
      ]);
      await bp([{ _obj: "flattenImage" }]);
      const token = await fs.createSessionToken(folder);
      await bp([
        {
          _obj: "save",
          as: { _obj: "PNGFormat", method: { _enum: "PNGMethod", _value: "quick" } },
          in: { _path: token, _kind: "local" },
          copy: true,
          lowerCase: true,
        },
      ]).catch(() => {});
      await bp([{ _obj: "close", saving: { _enum: "yesNo", _value: "no" } }]).catch(() => {});
    });
    setStatus("Spot artwork exported to chosen folder", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

// ============================================================
// DT STUDIO — DTG + DTF combined, with an optional halftone-screen finishing
// step that runs the same real pixel-based renderer as the Halftone tab
// (engines/halftone.js: writeHalftonePreview / writeHalftoneFinal) on the
// flattened, already-optimised layer.
// ============================================================

// Small, honest per-printer/per-film adjustments — real multipliers on the
// existing sliders, not decorative. Previously these chips changed their own
// "on" class and nothing else (dtgInk/dtgWhite/dtgDetail/dtfCol/dtfInk/dtfSharp
// were read directly with no profile applied).
const DTG_PRINTER_PROFILES = {
  epson: { inkMul: 1.0, whiteMul: 1.0, detailMul: 1.0 },
  brother: { inkMul: 0.9, whiteMul: 1.1, detailMul: 1.0 },
  kornit: { inkMul: 1.15, whiteMul: 0.9, detailMul: 1.05 },
  other: { inkMul: 1.0, whiteMul: 1.0, detailMul: 1.0 },
};
const DTF_FILM_PROFILES = {
  standard: { colMul: 1.0, inkMul: 1.0, sharpMul: 1.0 },
  matte: { colMul: 0.9, inkMul: 1.0, sharpMul: 0.85 },
  soft: { colMul: 1.0, inkMul: 1.1, sharpMul: 0.8 },
  stretch: { colMul: 1.05, inkMul: 0.95, sharpMul: 1.0 },
};

let _dtMode = "dtg"; // "dtg" | "dtf" — which half of DT Studio is active
function setDTMode(mode) {
  _dtMode = mode === "dtf" ? "dtf" : "dtg";
}
function getDTMode() {
  return _dtMode;
}

function buildDTGPipeline() {
  const printer = activeChip("#dtgChips", "dtg", "epson");
  const profile = DTG_PRINTER_PROFILES[printer] || DTG_PRINTER_PROFILES.epson;
  const inkRed = num("dtgInk") * profile.inkMul;
  const whiteBoost = num("dtgWhite") * profile.whiteMul;
  const detail = num("dtgDetail") * profile.detailMul;
  const cmds = [];
  if (inkRed > 0) cmds.push(opBright(-Math.round(inkRed * 0.3), Math.round(inkRed * 0.2)));
  if (whiteBoost > 0) cmds.push(opBright(Math.round(whiteBoost * 0.2), 0));
  if (detail > 0) cmds.push(opUnsharp(Math.round(20 + detail * 0.6), 0.5, 2));
  return cmds;
}

function buildDTFPipeline() {
  const film = activeChip("#dtfChips", "dtf", "standard");
  const profile = DTF_FILM_PROFILES[film] || DTF_FILM_PROFILES.standard;
  const colBoost = num("dtfCol") * profile.colMul;
  const sharp = num("dtfSharp") * profile.sharpMul;
  const inkRed = num("dtfInk") * profile.inkMul;
  const cmds = [];
  if (colBoost > 0) cmds.push(opBright(Math.round(colBoost * 0.3), Math.round(colBoost * 0.5)));
  if (inkRed > 0) cmds.push(opBright(-Math.round(inkRed * 0.2), 0));
  if (sharp > 0) cmds.push(opUnsharp(Math.round(sharp * 0.8), 0.8, 2));
  return cmds;
}

// Dispatches to whichever half of DT Studio is currently selected. Used by
// core/preview.js's currentPipeline() map for live preview on tab 9.
function buildDTPipeline() {
  return _dtMode === "dtf" ? buildDTFPipeline() : buildDTGPipeline();
}

async function applyDT() {
  if (!guard()) return;
  try {
    const cmds = buildDTPipeline();
    const wantHalftone = chk("dtHalftone");
    if (cmds.length === 0 && !wantHalftone) {
      setStatus("Adjust sliders then apply", "info");
      return;
    }
    const modeLabel = _dtMode === "dtf" ? "DTF" : "DTG";
    const groupName = _dtMode === "dtf" ? "DTFOptimise" : "DTGOptimise";
    await waitForRenderLock(); // don't touch the layer while a live preview render is still mid-write
    const myGen = bumpRenderGen();
    let layerId;
    await modal(modeLabel + " Optimised", async () => {
      layerId = await bpCreateLayer([{ _obj: "mergeVisible", duplicate: true }]);
      if (layerId == null) throw new Error("Could not create " + modeLabel + " layer");
      if (cmds.length) await bp(cmds);
      // Real pixel-based halftone (engines/halftone.js) on the flattened, already
      // colour/ink-optimised layer — reuses the Halftone tab's LPI/Angle/Dot
      // Gain/Ink Colour controls, exactly like the Halftone tab's own Apply.
      if (wantHalftone) await writeHalftoneFinal(layerId, myGen);
      await bp([
        {
          _obj: "set",
          _target: [{ _ref: "layer", _id: layerId }],
          to: { _obj: "layer", name: modeLabel + " Optimised" },
        },
      ]);
      await bp([{ _obj: "select", _target: [{ _ref: "layer", _id: layerId }] }]).catch(() => {});
      await groupSelectedInto(groupName);
    });
    recordAction("group", groupName);
    setStatus(modeLabel + " optimisation applied" + (wantHalftone ? " + halftone screen" : ""), "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

// ============================================================
// EXPORT
// ============================================================
async function saveAsPNG(folder) {
  const token = await fs.createSessionToken(folder);
  await bp([
    {
      _obj: "save",
      as: { _obj: "PNGFormat", method: { _enum: "PNGMethod", _value: "quick" } },
      in: { _path: token, _kind: "local" },
      copy: true,
      lowerCase: true,
    },
  ]);
}

async function exportScreen() {
  if (!guard()) return;
  try {
    const folder = await fs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "info");
      return;
    }
    const base = (window.app.activeDocument.name || "art").replace(/\.[^.]+$/, "").trim() || "untitled";
    setStatus("Exporting screens…", "info");
    await modal("Screen Export", async () => {
      await bp([
        {
          _obj: "duplicate",
          _target: [{ _ref: "document", _enum: "ordinal", _value: "first" }],
          name: base + "_screen",
        },
      ]);
      await bp([{ _obj: "make", _target: [{ _ref: "layer" }] }]);
      await bp([
        {
          _obj: "set",
          _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
          to: { _obj: "layer", name: "Registration" },
        },
      ]);
      await bp([{ _obj: "flattenImage" }]);
      await bp([{ _obj: "convertMode", to: { _enum: "colorSpace", _value: "grayscaleMode" } }]).catch(() => {});
      await saveAsPNG(folder);
      await bp([{ _obj: "close", saving: { _enum: "yesNo", _value: "no" } }]).catch(() => {});
    });
    setStatus("Screen print export complete", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function exportDTG() {
  if (!guard()) return;
  try {
    const folder = await fs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "info");
      return;
    }
    const base = (window.app.activeDocument.name || "art").replace(/\.[^.]+$/, "").trim() || "untitled";
    setStatus("Exporting DTG PNG…", "info");
    await modal("DTG Export", async () => {
      await bp([
        { _obj: "duplicate", _target: [{ _ref: "document", _enum: "ordinal", _value: "first" }], name: base + "_dtg" },
      ]);
      await bp([{ _obj: "mergeVisible" }]).catch(() => {});
      await saveAsPNG(folder);
      await bp([{ _obj: "close", saving: { _enum: "yesNo", _value: "no" } }]).catch(() => {});
    });
    setStatus("DTG flat alpha PNG exported", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}

async function exportDTF() {
  if (!guard()) return;
  try {
    const folder = await fs.getFolder();
    if (!folder) {
      setStatus("Export cancelled", "info");
      return;
    }
    const base = (window.app.activeDocument.name || "art").replace(/\.[^.]+$/, "").trim() || "untitled";
    setStatus("Exporting DTF file…", "info");
    await modal("DTF Export", async () => {
      await bp([
        { _obj: "duplicate", _target: [{ _ref: "document", _enum: "ordinal", _value: "first" }], name: base + "_dtf" },
      ]);
      await bp([{ _obj: "mergeVisible" }]).catch(() => {});
      await saveAsPNG(folder);
      await bp([{ _obj: "close", saving: { _enum: "yesNo", _value: "no" } }]).catch(() => {});
    });
    setStatus("DTF export complete", "success");
  } catch (e) {
    setStatus("Error: " + e.message, "error");
  }
}
