/**
 * core/validation.js — Pre-flight validation checklist
 *
 * Seven checks (document exists, RGB mode, layer exists, layer is raster,
 * layer unlocked, bit depth, RAM available), each returning
 * { pass, message, canAutoFix?, fixSuggestion? }. runAllChecks() runs all
 * seven and is used by engines/halftone.js's applyHalftoneWithArch() as a
 * warn-only pre-flight (logged to console, does not block the render).
 */

const CHECKS = {
  DOCUMENT_EXISTS: "documentExists",
  RGB_MODE: "rgbMode",
  LAYER_EXISTS: "layerExists",
  LAYER_RASTER: "layerRaster",
  LAYER_UNLOCKED: "layerUnlocked",
  BIT_DEPTH: "bitDepth",
  RAM_AVAILABLE: "ramAvailable",
};

/**
 * Check: Document exists and is open.
 */
function validateDocumentExists(doc) {
  if (!doc) {
    return {
      pass: false,
      message: "No active document. Open an image first.",
      canAutoFix: false,
    };
  }
  return { pass: true };
}

/**
 * Check: Document is RGB (not CMYK, Grayscale, Indexed).
 */
function validateRGBMode(doc) {
  if (!doc) return { pass: false, message: "No document" };

  // UXP exposes colour mode as doc.mode (e.g. "RGBColorMode"), not doc.colorModel.
  // Fall back to colorModel defensively; normalise to a string.
  const raw = doc.mode != null ? doc.mode : doc.colorModel;
  const mode = raw == null ? "" : String(raw);
  const upper = mode.toUpperCase();

  if (upper === "") {
    // Mode unreadable — do not raise a false RGB failure (warn-only check).
    return { pass: true, indeterminate: true, message: "Could not read document colour mode" };
  }
  if (upper.indexOf("RGB") !== -1) {
    return { pass: true };
  }

  return {
    pass: false,
    message: `Document is in ${mode} mode. Photoneshop requires RGB.`,
    canAutoFix: true,
    fixSuggestion: "Image > Mode > RGB",
  };
}

/**
 * Check: Layer exists and is active.
 */
function validateLayerExists(layer) {
  if (!layer) {
    return {
      pass: false,
      message: "No active layer. Select a layer first.",
      canAutoFix: false,
    };
  }
  return { pass: true };
}

/**
 * Check: Layer is raster (not smart object, group, text, etc).
 */
function validateLayerIsRaster(layer) {
  if (!layer) return { pass: false, message: "No layer" };

  const kind = layer.kind;
  const isRaster = kind === "pixel" || kind === "rasterLayer" || !kind;

  if (isRaster) {
    return { pass: true };
  }

  return {
    pass: false,
    message: `Layer is ${kind}. Photoneshop requires a raster layer.`,
    canAutoFix: kind === "smartObject",
    fixSuggestion: "Right-click > Rasterize Layer",
  };
}

/**
 * Check: Layer is not locked.
 */
function validateLayerUnlocked(layer) {
  if (!layer) return { pass: false, message: "No layer" };

  const flags = layer.flags || {};
  const isLocked = flags.locked || flags.pixelsLocked;

  if (!isLocked) {
    return { pass: true };
  }

  return {
    pass: false,
    message: "Layer is locked. Unlock the layer before operating.",
    canAutoFix: true,
    fixSuggestion: "Layer > Layer > Unlock Layer (or click lock icon)",
  };
}

/**
 * Check: Document is 8-bit or 16-bit (not 32-bit float, not 1-bit).
 */
function validateBitDepth(doc) {
  if (!doc) return { pass: false, message: "No document" };

  const bits = doc.bitsPerChannel;
  if (bits === 8 || bits === 16) {
    return { pass: true };
  }

  return {
    pass: false,
    message: `Image is ${bits}-bit. Photoneshop requires 8-bit or 16-bit color.`,
    canAutoFix: bits === 32,
    fixSuggestion: "Image > Mode > 16 Bit (or 8 Bit)",
  };
}

/**
 * Check: Sufficient RAM available for operation.
 * Uses PhotoneshopMemory.estimateAvailableRAM() if available.
 */
function validateRAMAvailable(estimatedNeedMB = 100) {
  let availableMB = 250; // Default fallback

  if (typeof window !== "undefined" && window.PhotoneshopMemory) {
    availableMB = window.PhotoneshopMemory.estimateAvailableRAM();
  }

  const safeThreshold = estimatedNeedMB * 1.5;

  if (availableMB >= safeThreshold) {
    return { pass: true };
  }

  return {
    pass: false,
    message: `Insufficient RAM. Need ${Math.round(safeThreshold)}MB, have ${Math.round(availableMB)}MB.`,
    canAutoFix: false,
    fixSuggestion: "Close other apps or reduce image size.",
    availableMB,
    neededMB: safeThreshold,
  };
}

/**
 * Run all pre-flight checks.
 * Returns { allPass: boolean, results: {checkName: result} }
 */
function runAllChecks(doc, layer, estimatedNeedMB = 100) {
  const results = {
    [CHECKS.DOCUMENT_EXISTS]: validateDocumentExists(doc),
    [CHECKS.RGB_MODE]: validateRGBMode(doc),
    [CHECKS.LAYER_EXISTS]: validateLayerExists(layer),
    [CHECKS.LAYER_RASTER]: validateLayerIsRaster(layer),
    [CHECKS.LAYER_UNLOCKED]: validateLayerUnlocked(layer),
    [CHECKS.BIT_DEPTH]: validateBitDepth(doc),
    [CHECKS.RAM_AVAILABLE]: validateRAMAvailable(estimatedNeedMB),
  };

  const allPass = Object.values(results).every((r) => r.pass !== false);

  return { allPass, results };
}

/**
 * Format validation report for user display.
 */
function formatValidationReport(allPass, results) {
  if (allPass) {
    return "✅ All pre-flight checks passed.";
  }

  let report = "❌ Validation failed:\n\n";
  for (const [checkName, result] of Object.entries(results)) {
    if (result.pass === false) {
      report += `• ${result.message}\n`;
      if (result.fixSuggestion) {
        report += `  → ${result.fixSuggestion}\n`;
      }
    }
  }

  return report;
}

// Export
if (typeof window !== "undefined") {
  window.PhotoneshopValidation = {
    CHECKS,
    validateDocumentExists,
    validateRGBMode,
    validateLayerExists,
    validateLayerIsRaster,
    validateLayerUnlocked,
    validateBitDepth,
    validateRAMAvailable,
    runAllChecks,
    formatValidationReport,
  };
}
