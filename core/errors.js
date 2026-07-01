/**
 * core/errors.js — PhotoneshopError: deep error context for Photoshop API calls.
 * Wraps a failing operation with (operation, details, cause) plus, optionally,
 * the layer state at the time of failure (withLayerState()) — used at the
 * real getPixels/putPixels call site in engines/halftone.js.
 */

class PhotoneshopError extends Error {
  constructor(operation, details, cause = null) {
    super(`${operation}: ${details}`);
    this.name = "PhotoneshopError";
    this.operation = operation;
    this.details = details;
    this.cause = cause;
    this.timestamp = new Date().toISOString();
    this.layerState = null; // Will be populated on crash
  }

  withLayerState(layer) {
    if (layer) {
      this.layerState = {
        name: layer.name || "(no name)",
        kind: layer.kind || "(unknown)",
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode || "(unknown)",
      };
    }
    return this;
  }

  toString() {
    let msg = this.message;
    if (this.layerState) {
      msg += `\nLayer: ${this.layerState.name} (${this.layerState.kind})`;
      msg += ` visible=${this.layerState.visible} opacity=${this.layerState.opacity}`;
    }
    if (this.cause) {
      msg += `\nOriginal error: ${this.cause.message || String(this.cause)}`;
    }
    msg += `\nTimestamp: ${this.timestamp}`;
    return msg;
  }
}

if (typeof window !== "undefined") {
  window.PhotoneshopErrors = { PhotoneshopError };
}
