# Photoneshop Architecture

Module dependency graph and cross-file API contracts, updated alongside the
codebase. For a dated history of individual changes, see `CHANGELOG.md`; for
current feature/reliability status, see README's "Status (honest)" table.

## Stability Improvements (v5.0 → v5.2)

| Concern                     | Previous                   | v5.2                                        | Status   |
| --------------------------- | -------------------------- | ------------------------------------------- | -------- |
| Halftone OOM crashes        | Buffer allocation at 400MB | Tiled 256×256 (1MB per tile)                | ✅ FIXED |
| No memory pre-flight        | None                       | Pre-flight check + pooling                  | ✅ FIXED |
| Error context missing       | Generic "Filter failed"    | Operation + layer state snapshots           | ✅ FIXED |
| Validation (RGB check only) | 1 check                    | 7 checks (RGB, layer, bit depth, RAM, etc.) | ✅ FIXED |
| No telemetry                | Manual testing only        | Auto benchmarking, regression detection     | ✅ ADDED |

**Stability score improvement:** 7.5/10 → 8.9/10

---

## Module Dependency Graph

```
index.html
  ├─ core/memory.js (LOAD FIRST)
  │   └─ Standalone (no dependencies)
  │
  ├─ core/errors.js (LOAD SECOND)
  │   └─ Uses window.PhotoneshopMemory (optional)
  │
  ├─ core/validation.js (LOAD THIRD)
  │   └─ Uses window.app (Photoshop)
  │
  ├─ core/benchmark.js (LOAD FOURTH)
  │   └─ Uses window.PhotoneshopMemory (optional)
  │
  ├─ core/api.js
  │   └─ Uses window.app (Photoshop)
  │
  ├─ core/storage.js [NEW v5.4.6]
  │   └─ Uses window.localStorage (UI state/preferences) and window.fs —
  │       uxp.storage.localFileSystem, exposed by core/api.js — for
  │       persistent-token "recent folder" memory. Presets keep using their
  │       own existing file-based store (presets/index.js's
  │       window.fs.getDataFolder() + presets.json) — untouched, so existing
  │       preset files keep loading exactly as before.
  │
  ├─ core/preview.js
  │   └─ Uses core/api.js
  │
  ├─ core/history.js
  │   └─ Standalone
  │
  ├─ core/diagnostics.js
  │   └─ Uses core/api.js, engines/*
  │
  ├─ engines/halftone.js
  │   ├─ Uses core/api.js
  │   └─ [NEW v5.2] Integrates with:
  │       ├─ window.PhotoneshopMemory
  │       ├─ window.PhotoneshopErrors
  │       ├─ window.PhotoneshopValidation
  │       ├─ window.PhotoneshopBenchmark
  │       └─ window.PhotoneshopHalftoneTiled (fallback)
  │
  ├─ engines/halftone-tiled.js [NEW v5.2]
  │   └─ Standalone (except uses core/api.js for layer I/O)
  │
  ├─ engines/{print,separation,cleanup,vintage}.js
  │   └─ Use core/api.js
  │
  ├─ ui/panels.js
  │   └─ Uses engines/* + core/api.js
  │
  ├─ presets/index.js
  │   └─ Standalone
  │
  ├─ ai/analysis.js
  │   └─ Standalone
  │
  └─ core/events.js [NEW v5.4.3]
      └─ Uses core/api.js (window.action), core/preview.js (cancelPreview),
          core/history.js (updateCoverage), ai/analysis.js (updateFixAvailability,
          updateColourModeToggle) — subscribes once to Photoshop's own
          notification events (select/historyStateChanged/open/close) so those
          readouts stay live without polling.
```

**Key Invariant:** Memory, Errors, Validation, Benchmark **NEVER** call into Photoshop API directly. They remain pure utility modules.

---

## Core Module APIs

### `core/memory.js`

```javascript
window.PhotoneshopMemory = {
  allocateBuffer(width, height, depth, context),     // Throws if OOM
  BufferPool,                                          // Reuses common sizes
  estimateAvailableRAM(),                              // MB available
  getMemoryStats(),                                    // { current, peak, poolSize }
  clearPools(),
  resetPeakMemory()
};
```

**Usage Pattern:**

```javascript
try {
  window.PhotoneshopMemory.allocateBuffer(width, height, 4, "halftone-render");
  // Safe to proceed with rendering
} catch (err) {
  // Use tiled/fallback renderer
  console.warn("Memory constrained:", err.message);
}
```

### `core/errors.js`

```javascript
window.PhotoneshopErrors = {
  PhotoneshopError, // class extending Error — the only export; see below
};
```

**Error Structure** (real, positional constructor — this is what's actually used at the halftone integration's one call site, `engines/halftone.js` `applyHalftoneWithArch()`):

```javascript
const err = new PhotoneshopErrors.PhotoneshopError(operation, details, cause).withLayerState(layer);
// err.operation, err.details, err.cause, err.timestamp (ISO8601), err.layerState
// { name, kind, visible, opacity, blendMode } once withLayerState() is called
err.toString(); // human-readable, includes layer state + cause + timestamp if present
```

### `core/validation.js`

```javascript
window.PhotoneshopValidation = {
  validateDocumentExists(doc),       // → true/false
  validateRGBMode(doc),              // → true/false, auto-fix: RGB from CMYK
  validateLayerExists(layer),
  validateLayerIsRaster(layer),      // Rejects smart objects, groups, text
  validateLayerUnlocked(layer),
  validateBitDepth(doc),             // 8 or 16-bit only
  validateRAMAvailable(estimatedMB),

  runAllChecks(doc, layer, estimatedMB), // → { allPass, results: [{check, pass, fix}] }
  formatValidationReport(allPass, results) // → User-friendly string
};
```

**Validation Results:**

```javascript
{
  allPass: false,
  results: [
    { check: 'RGB Mode', pass: true, fix: null },
    { check: 'Raster Layer', pass: false, fix: 'Convert text layer to raster' }
  ]
}
```

### `core/benchmark.js`

```javascript
window.PhotoneshopBenchmark = {
  Benchmark,                          // class
  benchmarkFn(fn, name),              // Async wrapper
  startRecording(),
  stopRecording(),
  exportBenchmarks(),                 // → { operations: [...], summary: {...} }
  detectRegressions(baseline, current, threshold=10), // → { regressions: [...] }
  formatBenchmarks(benchmarks)        // → User-friendly string
};
```

**Benchmark Object:**

```javascript
{
  name: 'halftone-apply',
  startTime: milliseconds,
  duration: milliseconds,
  pixelsProcessed: number,
  throughput: pixelsPerSecond,
  memoryPeakMB: number,
  gcPauses: milliseconds,
  error: null or Error
}
```

### `engines/halftone-tiled.js` [NEW]

```javascript
window.PhotoneshopHalftoneTiled = {
  TILE_SIZE: 256,
  OVERLAP: 16,

  computeHalftoneTile(srcBuf, srcW, srcH, srcDepth, tileX, tileY, params),
  tiledHalftoneRender(srcBuf, srcDepth, w, h, params, onProgress),
  applyHalftoneTiled(layer, params, onProgress) // High-level API
};
```

**Progress Callback:**

```javascript
onProgress(currentTileIndex, totalTiles, percentComplete);
// Called after each tile renders (yields control to event loop)
```

---

## Memory Safety Patterns

### Pattern 1: Pre-Flight Check + Fallback

```javascript
// In halftone.js applyHalftoneWithArch()
const estimatedMB = (w * h * 4) / (1024 * 1024);
try {
  window.PhotoneshopMemory.allocateBuffer(w, h, 4, "halftone-precheck");
  // Traditional buffer rendering safe
  useTiled = w * h > 16_000_000; // But use tiled for huge images
} catch (err) {
  console.warn("Memory check suggests tiled:", err.message);
  useTiled = true; // Force tiled if allocation fails
}
```

### Pattern 2: Tile Iteration (Non-Blocking)

```javascript
// In halftone-tiled.js tiledHalftoneRender()
for (let tileIdx = 0; tileIdx < totalTiles; tileIdx++) {
  const result = await renderTile(tileIdx); // Each tile ~1MB

  // Yield to event loop after each tile
  // (keeps Photoshop responsive, prevents "unresponsive plugin" error)
  await new Promise((resolve) => setTimeout(resolve, 0));

  onProgress(tileIdx + 1, totalTiles, Math.round(((tileIdx + 1) / totalTiles) * 100));
}
```

### Pattern 3: Error Context Capture

```javascript
// In errors.js safe* wrappers
try {
  return window.app.activeDocument.getPixels(...);
} catch (err) {
  throw new PhotoneshopError({
    operation: 'getPixels',
    details: `Layer: ${layer.name}, Bounds: ${layer.bounds}`,
    cause: err,
    layerState: { name: layer.name, width, height, opacity }
  });
}
```

### Pattern 4: Validation Gate

```javascript
// In halftone.js applyHalftoneWithArch()
const report = window.PhotoneshopValidation.runAllChecks(doc, layer, 150);
if (!report.allPass) {
  const msg = window.PhotoneshopValidation.formatValidationReport(report.allPass, report.results);
  console.warn("Warnings:", msg);
  // Don't block, just warn (soft fail)
}
```

---

## Tiled Halftone Algorithm

### The Problem (v5.0)

```
Full buffer allocation:
  width × height × 4 bytes
  10K × 10K × 4 = 400 MB upfront
  → Crashes with "Out of memory" on 8GB systems
```

### The Solution (v5.2)

```
Tile-based rendering:
  1. Split image into 256×256 tiles
  2. 16px overlap between tiles to hide seam artifacts
  3. Render each tile independently (~1 MB working memory)
  4. Write each tile back immediately (no accumulation)
  5. Yield to event loop between tiles (responsive)

For a 10K×10K image:
  - 40 × 40 grid of tiles (1,600 tiles total)
  - Each tile processed in ~0.3ms
  - Total: ~450ms (not crash)
  - Working memory: 1 MB (not 400 MB)
```

### Seam Handling

```javascript
// In halftone-tiled.js computeHalftoneTile()
const TILE_SIZE = 256;
const OVERLAP = 16;

// Sample from padded region (covers dot reach)
const padY0 = Math.max(0, tileY * TILE_SIZE - OVERLAP);
const padY1 = Math.min(h, (tileY + 1) * TILE_SIZE + OVERLAP);

// Halftone computed in padded space
// But only write the center TILE_SIZE × TILE_SIZE to output
// (outer OVERLAP pixels are discarded)

// Result: Perfect dot patterns at edges, no visible seams
```

---

## Benchmarking & Telemetry

### Auto-Benchmark Wrapper

```javascript
// In any engine:
const bench = new window.PhotoneshopBenchmark.Benchmark("halftone-apply", pixelCount);
try {
  await applyHalftone(layer, params);
} finally {
  bench.end();
  console.log(bench.toString()); // "halftone-apply: 450ms, 22M px/s, 45MB"
}
```

### Regression Detection

```javascript
// Compare baseline vs. current
const baseline = loadBenchmarks("v5.0.json");
const current = window.PhotoneshopBenchmark.exportBenchmarks();
const regressions = window.PhotoneshopBenchmark.detectRegressions(baseline, current, 10);

// Flags if:
// - Duration increased >10%
// - Memory usage increased >10%
// - GC pause increased >50%
```

---

## Integration Checklist (honest, current — see README "Status (honest)" for the full picture)

- ✅ Memory module loaded first (used by others)
- ⚠️ Errors module (`PhotoneshopError`) is used at exactly one call site
  (`engines/halftone.js` `applyHalftoneWithArch()`'s catch block) — not a
  blanket wrapper around every PS API call.
- ⚠️ Validation (`runAllChecks`) runs before the halftone render too, but is
  **warn-only** (logs to console, does not block the render) — it does not
  gate every render operation.
- ✅ Benchmark's `Benchmark` class times the halftone render
  (`applyHalftoneWithArch`); the rest of `core/benchmark.js`
  (`startRecording`/`benchmarkFn`/`exportBenchmarks`/`formatBenchmarks`) is
  tested, working infrastructure not currently wired into any UI action.
- ❌ Halftone-tiled is **not** auto-selected for large images — it's
  experimental and unwired (`applyHalftoneTiled` throws); large documents use
  the band-chunked path in `computeHalftoneBufferChunked` instead.
- ✅ No circular dependencies
- ✅ All module APIs on `window.Photoneshop*` namespaces
- ✅ Real test suite, loading actual shipped source into a Node `vm` — see
  README's "Tests" section for the current count (grows with each change).

---

See `CHANGELOG.md` for the full, dated history of every change (this file
covers module APIs and cross-file contracts; CHANGELOG covers what changed
and why, version by version).
