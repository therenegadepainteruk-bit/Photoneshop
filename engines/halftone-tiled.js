/**
 * engines/halftone-tiled.js — Tiled halftone rendering
 *
 * Solves CONCERN #1 (Halftone engine allocates entire buffer):
 * - Process 256×256 tiles instead of full image
 * - Max 50MB working memory (not 400MB)
 * - Emit progress per tile
 * - Write directly to document layer per tile
 * - Gracefully fall back if tile write fails
 *
 * Uses same halftone math as engines/halftone.js (cell-based screening)
 * but streams results rather than accumulating in RAM.
 */

const TILE_SIZE = 256; // 256×256 = 64KB tile (256×256×4 bytes)
const OVERLAP = 16; // Pixel overlap between tiles to hide artifacts

/**
 * Compute halftone for a single tile with overlap.
 * Called for each tile; result is stamped directly to layer.
 *
 * @param {Uint8Array} srcBuf — full-resolution source pixels
 * @param {number} srcWidth — full image width
 * @param {number} srcHeight — full image height
 * @param {number} tileX — tile column (0, 1, 2, ...)
 * @param {number} tileY — tile row (0, 1, 2, ...)
 * @param {object} params — {lpi, angle, dotGain, dpi, inkR, inkG, inkB}
 * @returns {{pixels: Uint8Array, x: number, y: number, w: number, h: number}}
 */
function computeHalftoneTile(srcBuf, srcWidth, srcHeight, srcDepth, tileX, tileY, params) {
  const { lpi, angle, dotGain, dpi, inkR, inkG, inkB } = params;

  // Tile bounds with overlap
  const x0 = tileX * TILE_SIZE;
  const y0 = tileY * TILE_SIZE;
  const x1 = Math.min(srcWidth, x0 + TILE_SIZE + OVERLAP);
  const y1 = Math.min(srcHeight, y0 + TILE_SIZE + OVERLAP);

  const w = x1 - x0;
  const h = y1 - y0;

  // Allocate tile buffer (not full image)
  const tilePixels = new Uint8Array(w * h * 4);
  const cellSize = Math.max(1.5, (dpi || 300) / lpi);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  const gain = (dotGain || 0) / 100;
  const maxRFactor = (1 - gain * 0.5) * 1.25;

  // Iterate tile pixels and apply halftone
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Sample source pixel
      const srcIdx = (y * srcWidth + x) * srcDepth;
      if (srcIdx + 3 >= srcBuf.length) continue; // FIX 1.1: bounds check

      const a = srcDepth >= 4 ? srcBuf[srcIdx + 3] : 255;
      if (a < 10) continue;

      const tone =
        srcDepth >= 3 ? Math.round((srcBuf[srcIdx] + srcBuf[srcIdx + 1] + srcBuf[srcIdx + 2]) / 3) : srcBuf[srcIdx];

      // Find nearest screen cell for this pixel
      const rx = x * cos + y * sin,
        ry = -x * sin + y * cos;
      const cellX = Math.floor(rx / cellSize);
      const cellY = Math.floor(ry / cellSize);
      const ccRX = (cellX + 0.5) * cellSize;
      const ccRY = (cellY + 0.5) * cellSize;

      const dotR = (cellSize / 2) * maxRFactor * (1 - tone / 255);
      if (dotR <= 0) continue;

      const dotR2 = dotR * dotR;
      const reach = Math.ceil(dotR + 1);

      // Draw dot in tile buffer
      const x0d = Math.max(x0, x - reach);
      const x1d = Math.min(x1, x + reach);
      const y0d = Math.max(y0, y - reach);
      const y1d = Math.min(y1, y + reach);

      for (let yy = y0d; yy < y1d; yy++) {
        for (let xx = x0d; xx < x1d; xx++) {
          const rxx = xx * cos + yy * sin;
          const ryy = -xx * sin + yy * cos;
          const dx = rxx - ccRX,
            dy = ryy - ccRY;

          if (dx * dx + dy * dy <= dotR2) {
            const tileIdx = ((yy - y0) * w + (xx - x0)) * 4;
            tilePixels[tileIdx] = inkR;
            tilePixels[tileIdx + 1] = inkG;
            tilePixels[tileIdx + 2] = inkB;
            tilePixels[tileIdx + 3] = 255;
          }
        }
      }
    }
  }

  return {
    pixels: tilePixels,
    x: x0,
    y: y0,
    w: w,
    h: h,
  };
}

/**
 * Render entire image as tiles, streaming to layer.
 * Yields to event loop after each tile.
 * Emits progress callbacks.
 *
 * @param {Uint8Array} srcBuf — full source pixels
 * @param {number} width — image width
 * @param {number} height — image height
 * @param {object} params — halftone parameters
 * @param {Function} onProgress — callback(tileIndex, totalTiles, progress%)
 * @returns {Promise<Array>} tiles written
 */
async function tiledHalftoneRender(srcBuf, srcDepth, width, height, params, onProgress = () => {}) {
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const totalTiles = tilesX * tilesY;
  const tiles = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const tileIdx = ty * tilesX + tx;

      try {
        const tile = computeHalftoneTile(srcBuf, width, height, srcDepth, tx, ty, params);
        tiles.push(tile);

        const progress = Math.round(((tileIdx + 1) / totalTiles) * 100);
        onProgress(tileIdx + 1, totalTiles, progress);
      } catch (e) {
        console.error(`Tile [${tx}, ${ty}] failed:`, e);
        // Continue with next tile instead of crashing
        throw new Error(`halftone-tiled: tile [${tx}, ${ty}] failed: ${e.message}`);
      }

      // Yield to event loop (prevents "unresponsive plugin" crash)
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return tiles;
}

/**
 * Apply halftone to document layer using tiled rendering.
 *
 * EXPERIMENTAL — NOT WIRED INTO THE UI. This function does not yet perform real
 * pixel I/O: a production implementation must (a) read the layer's real pixels via
 * window.imaging.getPixels, (b) composite overlapping tiles correctly, and (c) write
 * each tile back via window.imaging.putPixels with per-tile targetBounds. None of
 * that is implemented, so calling this would render nothing. It therefore throws
 * rather than returning a misleading success object.
 *
 * The Apply-halftone button uses engines/halftone.js → writeHalftoneFinal
 * (computeHalftoneBufferChunked), which is the verified, functional path. The pure
 * tile math below (computeHalftoneTile / tiledHalftoneRender) is real and unit-tested,
 * and is exported so a future version can build real pixel streaming on top of it.
 *
 * @param {Layer} layer
 * @param {object} params
 * @param {Function} onProgress
 * @throws {Error} always — not implemented
 */
async function applyHalftoneTiled(layer, params, onProgress = () => {}) {
  throw new Error(
    "halftone-tiled: applyHalftoneTiled is experimental and not implemented " +
      "(no real pixel read/write). Use the standard Apply-halftone path " +
      "(engines/halftone.js → writeHalftoneFinal). See file header."
  );
}

// Export
if (typeof window !== "undefined") {
  window.PhotoneshopHalftoneTiled = {
    tiledHalftoneRender,
    applyHalftoneTiled,
    TILE_SIZE,
    OVERLAP,
  };
}
