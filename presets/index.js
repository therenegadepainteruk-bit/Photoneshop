/**
 * presets/index.js — 25+ built-in presets + user preset manager
 */

/* ---- BUILT-IN PRESET DATA ---- */
let PRINTER_PRESETS = [
  {
    id: "epson_f3000",
    name: "Epson F3000",
    thresh: 130,
    exposure: 5,
    highlight: 15,
    shadow: 10,
    bright: 5,
    contrast: 12,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "epson_f2100",
    name: "Epson F2100",
    thresh: 128,
    exposure: 0,
    highlight: 10,
    shadow: 8,
    bright: 3,
    contrast: 10,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 95,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "brother_gtx",
    name: "Brother GTX Pro",
    thresh: 125,
    exposure: 8,
    highlight: 12,
    shadow: 8,
    bright: 5,
    contrast: 15,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 1,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "kornit_atlas",
    name: "Kornit Atlas Max",
    thresh: 120,
    exposure: 10,
    highlight: 20,
    shadow: 5,
    bright: 8,
    contrast: 18,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 0,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "roland_ty",
    name: "Roland TY-300",
    thresh: 132,
    exposure: 3,
    highlight: 10,
    shadow: 5,
    bright: 2,
    contrast: 8,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 95,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "generic_dtg",
    name: "Generic DTG",
    thresh: 128,
    exposure: 0,
    highlight: 10,
    shadow: 5,
    bright: 0,
    contrast: 10,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
];

let GARMENT_PRESETS = [
  {
    id: "black_heavy",
    name: "Black Cotton (Heavy)",
    thresh: 110,
    exposure: 15,
    highlight: 25,
    shadow: 5,
    bright: 20,
    contrast: 30,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 3,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "black_light",
    name: "Black Cotton (Light)",
    thresh: 115,
    exposure: 12,
    highlight: 20,
    shadow: 5,
    bright: 15,
    contrast: 25,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 95,
    wChoke: 2,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "white_cotton",
    name: "White Cotton",
    thresh: 128,
    exposure: 0,
    highlight: 10,
    shadow: 5,
    bright: -5,
    contrast: 10,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 0,
    wChoke: 0,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "heather",
    name: "Heather Grey",
    thresh: 122,
    exposure: 8,
    highlight: 15,
    shadow: 8,
    bright: 5,
    contrast: 12,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 80,
    wChoke: 2,
    wFeather: 3,
    wHl: 0,
  },
  {
    id: "sand",
    name: "Natural / Sand",
    thresh: 125,
    exposure: 5,
    highlight: 10,
    shadow: 5,
    bright: 3,
    contrast: 8,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 60,
    wChoke: 2,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "navy",
    name: "Navy",
    thresh: 112,
    exposure: 12,
    highlight: 18,
    shadow: 5,
    bright: 15,
    contrast: 22,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 3,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "triblen",
    name: "Tri-blend / Poly",
    thresh: 118,
    exposure: 10,
    highlight: 15,
    shadow: 8,
    bright: 8,
    contrast: 15,
    blur: 1,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 85,
    wChoke: 3,
    wFeather: 4,
    wHl: 0,
  },
];

let STYLE_PRESETS = [
  {
    id: "photo_prem",
    name: "Photo Premium DTG",
    thresh: 115,
    exposure: 8,
    highlight: 20,
    shadow: 15,
    bright: 5,
    contrast: 20,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 0,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "photo_std",
    name: "Photo Standard",
    thresh: 120,
    exposure: 5,
    highlight: 15,
    shadow: 10,
    bright: 3,
    contrast: 15,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 90,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "vintage_band",
    name: "Vintage Band Tee",
    thresh: 145,
    exposure: 0,
    highlight: 5,
    shadow: 20,
    bright: 5,
    contrast: 20,
    blur: 2,
    fade: 45,
    distress: 40,
    bleed: 8,
    grain: 35,
    effect: "none",
    lpi: 45,
    htAngle: 45,
    htSize: 10,
    dotGain: 5,
    halftone: 30,
    wDensity: 85,
    wChoke: 3,
    wFeather: 2,
    wHl: 0,
  },
  {
    id: "heavy_dist",
    name: "Heavy Distress",
    thresh: 155,
    exposure: 0,
    highlight: 0,
    shadow: 10,
    bright: 0,
    contrast: 25,
    blur: 3,
    fade: 60,
    distress: 70,
    bleed: 12,
    grain: 55,
    effect: "photocopy",
    lpi: 45,
    htAngle: 45,
    htSize: 12,
    dotGain: 8,
    halftone: 50,
    wDensity: 80,
    wChoke: 4,
    wFeather: 3,
    wHl: 0,
  },
  {
    id: "streetwear",
    name: "Streetwear",
    thresh: 135,
    exposure: 5,
    highlight: 10,
    shadow: 5,
    bright: 5,
    contrast: 30,
    blur: 0,
    fade: 10,
    distress: 20,
    bleed: 3,
    grain: 15,
    effect: "none",
    lpi: 65,
    htAngle: 45,
    htSize: 8,
    dotGain: 3,
    halftone: 20,
    wDensity: 95,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "fine_detail",
    name: "Fine Detail / Line",
    thresh: 122,
    exposure: 5,
    highlight: 5,
    shadow: 5,
    bright: 0,
    contrast: 15,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 6,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 1,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "hi_contrast",
    name: "High Contrast",
    thresh: 140,
    exposure: 10,
    highlight: 30,
    shadow: 0,
    bright: 10,
    contrast: 40,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 2,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "minimal",
    name: "Minimal / Clean",
    thresh: 128,
    exposure: 0,
    highlight: 0,
    shadow: 0,
    bright: 0,
    contrast: 5,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 8,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 1,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "screen_45",
    name: "Screen Print 45 LPI",
    thresh: 130,
    exposure: 5,
    highlight: 10,
    shadow: 5,
    bright: 3,
    contrast: 15,
    blur: 1,
    fade: 5,
    distress: 5,
    bleed: 2,
    grain: 5,
    effect: "none",
    lpi: 45,
    htAngle: 45,
    htSize: 10,
    dotGain: 5,
    halftone: 80,
    wDensity: 100,
    wChoke: 3,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "screen_65",
    name: "Screen Print 65 LPI",
    thresh: 128,
    exposure: 5,
    highlight: 8,
    shadow: 5,
    bright: 2,
    contrast: 12,
    blur: 0,
    fade: 3,
    distress: 3,
    bleed: 1,
    grain: 3,
    effect: "none",
    lpi: 65,
    htAngle: 45,
    htSize: 8,
    dotGain: 3,
    halftone: 80,
    wDensity: 100,
    wChoke: 2,
    wFeather: 0,
    wHl: 0,
  },
  {
    id: "tattoo",
    name: "Tattoo Style",
    thresh: 138,
    exposure: 5,
    highlight: 5,
    shadow: 15,
    bright: -5,
    contrast: 35,
    blur: 0,
    fade: 5,
    distress: 10,
    bleed: 3,
    grain: 8,
    effect: "none",
    lpi: 0,
    htAngle: 45,
    htSize: 7,
    dotGain: 0,
    halftone: 0,
    wDensity: 100,
    wChoke: 2,
    wFeather: 1,
    wHl: 0,
  },
  {
    id: "halftone_art",
    name: "Halftone Art",
    thresh: 128,
    exposure: 5,
    highlight: 10,
    shadow: 5,
    bright: 5,
    contrast: 20,
    blur: 0,
    fade: 0,
    distress: 0,
    bleed: 0,
    grain: 0,
    effect: "none",
    lpi: 55,
    htAngle: 45,
    htSize: 9,
    dotGain: 5,
    halftone: 100,
    wDensity: 100,
    wChoke: 2,
    wFeather: 0,
    wHl: 0,
  },
];

/* ---- USER PRESET KEYS (all slider IDs that are saveable) ---- */
let PRESET_KEYS = [
  "thresh",
  "exposure",
  "highlight",
  "shadow",
  "bright",
  "contrast",
  "blur",
  "fade",
  "distress",
  "bleed",
  "grain",
  "effect",
  "lpi",
  "htAngle",
  "htSize",
  "dotGain",
  "halftone",
  "htColor",
  "wDensity",
  "wChoke",
  "wFeather",
  "wHl",
];

let _userPresets = [];
let _lastUsed = null;

/* ---- PERSISTENCE ---- */
async function presetFile(create) {
  try {
    let dataFolder = await window.fs.getDataFolder();
    if (!dataFolder) return null;
    try {
      return await dataFolder.getEntry("presets.json");
    } catch (e) {
      return create ? await dataFolder.createFile("presets.json", { overwrite: true }) : null;
    }
  } catch (e) {
    return null;
  }
}

async function loadPresets() {
  try {
    let f = await presetFile(false);
    if (f) {
      let txt = await f.read();
      let data = JSON.parse(txt || "{}");
      _userPresets = data.presets || [];
      _lastUsed = data.lastUsed || null;
    }
  } catch (e) {
    _userPresets = [];
    _lastUsed = null;
  }
  renderUserPresets();
}

async function persistPresets() {
  try {
    let f = await presetFile(true);
    if (f) await f.write(JSON.stringify({ presets: _userPresets, lastUsed: _lastUsed }));
  } catch (e) {
    setStatus("Error: could not save presets", "error");
  }
}

function currentValues() {
  let v = {};
  PRESET_KEYS.forEach(function (k) {
    let el = document.getElementById(k);
    if (el) v[k] = el.value;
  });
  return v;
}

function applyValues(v) {
  Object.keys(v).forEach(function (k) {
    let el = document.getElementById(k);
    if (!el) return;
    if (k === "effect" || k === "htColor") {
      el.value = v[k];
    } else {
      setSlider(k, v[k]);
    } // setSlider defined in core/api.js
  });
  if (hasDoc()) schedulePreview(); // schedulePreview in core/preview.js
}

// Called from core/preview.js on apply
async function saveLastUsed() {
  _lastUsed = currentValues();
  await persistPresets();
}

async function saveUserPreset() {
  let input = document.getElementById("presetNameInput");
  let name = (input ? input.value : "").trim();
  if (!name) {
    setStatus("Enter a name for this preset", "warning");
    return;
  }
  let existing = _userPresets.find(function (p) {
    return p.name === name;
  });
  if (existing) {
    existing.values = currentValues();
  } else {
    _userPresets.push({ name: name, fav: false, values: currentValues() });
  }
  if (input) input.value = "";
  await persistPresets();
  renderUserPresets();
  setStatus("Saved: " + name, "success");
}

async function deleteUserPreset(name) {
  _userPresets = _userPresets.filter(function (p) {
    return p.name !== name;
  });
  await persistPresets();
  renderUserPresets();
  setStatus("Deleted: " + name, "info");
}

async function toggleFav(name) {
  let p = _userPresets.find(function (x) {
    return x.name === name;
  });
  if (p) p.fav = !p.fav;
  await persistPresets();
  renderUserPresets();
}

/* ---- RENDER BUILT-IN PRESETS ---- */
function renderBuiltinPresets(category) {
  let list = document.getElementById("builtinList");
  if (!list) return;
  let data = category === "printer" ? PRINTER_PRESETS : category === "garment" ? GARMENT_PRESETS : STYLE_PRESETS;
  list.innerHTML = "";
  data.forEach(function (preset) {
    let btn = document.createElement("sp-action-button");
    btn.textContent = preset.name;
    btn.addEventListener("click", function () {
      applyValues(preset);
      setStatus("Preset: " + preset.name, "success");
    });
    list.appendChild(btn);
  });
}

/* ---- RENDER USER PRESETS ---- */
function renderUserPresets() {
  let list = document.getElementById("userPresetList");
  if (!list) return;
  let sorted = _userPresets.slice().sort(function (a, b) {
    return b.fav - a.fav || a.name.localeCompare(b.name);
  });
  let html = "";
  if (_lastUsed) {
    html +=
      '<div class="preset-row"><span class="preset-name" data-last="1">Last used</span><span class="preset-badge">Auto</span></div>';
  }
  if (sorted.length === 0 && !_lastUsed) {
    list.innerHTML = '<p class="hint">No saved presets yet.</p>';
    return;
  }
  sorted.forEach(function (p) {
    html +=
      '<div class="preset-row">' +
      '<sp-action-button quiet class="star"' +
      (p.fav ? " selected" : "") +
      ' data-fav="' +
      encodeURIComponent(p.name) +
      '">' +
      (p.fav ? "\u2605" : "\u2606") +
      "</sp-action-button>" +
      '<span class="preset-name" data-load="' +
      encodeURIComponent(p.name) +
      '">' +
      p.name +
      "</span>" +
      '<sp-action-button quiet class="del" data-del="' +
      encodeURIComponent(p.name) +
      '">\u00d7</sp-action-button>' +
      "</div>";
  });
  list.innerHTML = html;
  list.querySelectorAll("[data-load]").forEach(function (el) {
    el.addEventListener("click", function () {
      let p = _userPresets.find(function (x) {
        return x.name === decodeURIComponent(el.dataset.load);
      });
      if (p) {
        applyValues(p.values);
        setStatus("Preset: " + p.name, "success");
      }
    });
  });
  list.querySelectorAll("[data-last]").forEach(function (el) {
    el.addEventListener("click", function () {
      if (_lastUsed) {
        applyValues(_lastUsed);
        setStatus("Last used settings restored", "info");
      }
    });
  });
  list.querySelectorAll("[data-fav]").forEach(function (el) {
    el.addEventListener("click", function () {
      toggleFav(decodeURIComponent(el.dataset.fav));
    });
  });
  list.querySelectorAll("[data-del]").forEach(function (el) {
    el.addEventListener("click", function () {
      deleteUserPreset(decodeURIComponent(el.dataset.del));
    });
  });
}

/* ---- CATEGORY CHIP INIT ---- */
function initBuiltinCategoryChips() {
  document.querySelectorAll("#presetCatChips sp-action-button").forEach(function (c) {
    c.addEventListener("click", function (e) {
      selectOne("#presetCatChips sp-action-button", e.currentTarget); // core/api.js
      renderBuiltinPresets(e.currentTarget.dataset.cat);
    });
  });
  renderBuiltinPresets("printer"); // default
}
