/**
 * core/memory.js — Memory manager for large image operations
 *
 * Solves CONCERN #2 (No dedicated memory manager):
 * - Pre-flight RAM estimation (fail early, not during allocation)
 * - Buffer pooling (reuse common sizes, reduce GC pressure)
 * - Peak memory tracking (detect regression)
 * - Safe allocation with context-rich errors
 */

const MEMORY_POOL_SIZES = [
  [256, 256, 4],   // 256 KB — common tile size
  [512, 512, 4],   // 1 MB
  [1024, 1024, 4], // 4 MB
];

const pools = {};
let peakMemoryMB = 0;
let currentMemoryMB = 0;

/**
 * Initialize buffer pool for a given size
 */
function initPoolIfNeeded(width, height, depth) {
  const key = `${width}x${height}x${depth}`;
  if (!pools[key]) {
    pools[key] = [];
  }
}

/**
 * Allocate a buffer, using pool if available.
 * Throws with context if RAM unavailable.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} depth — bytes per pixel (typically 4)
 * @param {string} context — error message context (e.g., "halftone preview")
 * @returns {Uint8Array}
 */
function allocateBuffer(width, height, depth, context = "buffer") {
  const byteSize = width * height * depth;
  const sizeMB = byteSize / (1024 * 1024);

  // Pre-flight check: is allocation feasible?
  const availableRAM = estimateAvailableRAM();
  const safeThreshold = sizeMB * 1.5; // GC + overhead

  if (availableRAM < safeThreshold) {
    const errorMsg = `allocateBuffer failed for ${context}: ` +
      `need ${Math.round(safeThreshold)}MB, available ${Math.round(availableRAM)}MB. ` +
      `Try: reduce image size, close other apps, or split into tiles.`;
    throw new Error(errorMsg);
  }

  // Try pool first (common sizes)
  const key = `${width}x${height}x${depth}`;
  initPoolIfNeeded(width, height, depth);

  if (pools[key].length > 0) {
    const buf = pools[key].pop();
    // Pool buffer is already allocated; update tracking
    currentMemoryMB += sizeMB;
    if (currentMemoryMB > peakMemoryMB) peakMemoryMB = currentMemoryMB;
    return buf;
  }

  // Allocate fresh buffer
  try {
    const buf = new Uint8Array(byteSize);
    currentMemoryMB += sizeMB;
    if (currentMemoryMB > peakMemoryMB) peakMemoryMB = currentMemoryMB;
    return buf;
  } catch (e) {
    const errorMsg = `allocateBuffer: ${context} failed (${width}×${height}×${depth}). ` +
      `Allocation attempted: ${Math.round(sizeMB)}MB. ` +
      `Error: ${e.message}. ` +
      `Mitigation: switch to tiled renderer or reduce preview resolution.`;
    throw new Error(errorMsg);
  }
}

/**
 * Release a buffer back to pool (if pooled) or mark as freed.
 */
function releaseBuffer(buffer, width, height, depth) {
  if (!buffer) return;
  const sizeMB = (width * height * depth) / (1024 * 1024);
  const key = `${width}x${height}x${depth}`;

  if (MEMORY_POOL_SIZES.some(s => s[0] === width && s[1] === height && s[2] === depth)) {
    // Pooled size — return to pool
    initPoolIfNeeded(width, height, depth);
    if (pools[key].length < 3) {
      pools[key].push(buffer);
      currentMemoryMB = Math.max(0, currentMemoryMB - sizeMB);
      return;
    }
  }

  // Non-pooled or pool full — just deref
  currentMemoryMB = Math.max(0, currentMemoryMB - sizeMB);
}

/**
 * Estimate available RAM (MB).
 */
function estimateAvailableRAM() {
  if (performance && performance.memory) {
    const heapLimit = performance.memory.jsHeapSizeLimit;
    const heapUsed = performance.memory.usedJSHeapSize;
    const available = heapLimit - heapUsed;
    return Math.max(100, available / (1024 * 1024));
  }
  return 250; // Conservative fallback
}

/**
 * Get memory stats for telemetry.
 */
function getMemoryStats() {
  return {
    currentMemoryMB: Math.round(currentMemoryMB * 100) / 100,
    peakMemoryMB: Math.round(peakMemoryMB * 100) / 100,
    availableRAM: Math.round(estimateAvailableRAM() * 100) / 100,
    pooledBuffers: Object.keys(pools).map(k => ({
      size: k,
      count: pools[k].length,
    })),
  };
}

/**
 * Clear all pools (cleanup).
 */
function clearPools() {
  for (const key in pools) {
    pools[key] = [];
  }
  currentMemoryMB = 0;
}

/**
 * Reset peak memory tracker.
 */
function resetPeakMemory() {
  peakMemoryMB = 0;
}

if (typeof window !== 'undefined') {
  window.PhotoneshopMemory = {
    allocateBuffer,
    releaseBuffer,
    estimateAvailableRAM,
    getMemoryStats,
    clearPools,
    resetPeakMemory,
  };
}
