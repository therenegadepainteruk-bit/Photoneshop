# Photoneshop v5.2.6

Photoshop UXP plugin for DTF / DTG / screen-print garment workflows.

## What v5.2.1 fixes (the reason this build exists)

v5.2.0 introduced an integration layer for the Apply-halftone button that was
**broken on every click**: it called `window.PhotoneshopHalftoneIntegrated.applyHalftone`,
which in turn dereferenced a global (`window.PhotoneshopHalftone`) that is **never
assigned anywhere**, throwing `"Original halftone module not loaded"` before any
pixels were touched. It also passed `{ _id: layerId }` (no `.bounds`) and called a
nonexistent `PhotoneshopError.wrap()`, and routed large images to a tiled renderer
whose apply function was a mock that read/wrote nothing.

v5.2.1 rewires the integration to the module's **own verified render**
(`writeHalftoneFinal` → `computeHalftoneBufferChunked`) and wraps it with the
architectural modules that genuinely operate on real data:

- **validation** (`core/validation.js`) — RGB/raster/lock/bit-depth/RAM checks, warn-only
- **benchmark** (`core/benchmark.js`) — real timing + throughput on the actual render
- **error context** (`core/errors.js`) — wraps failures in `PhotoneshopError` with the real `(operation, details, cause)` constructor

No nonexistent globals, no mock render in the active path. The Apply-halftone button
works again (restored to the v5.0 functional behaviour) and is now instrumented.

## Tests — `npm test` (or `node test-suite.js`)

First time: `npm install` (installs ESLint + Prettier as dev tooling; the plugin
itself has zero runtime dependencies — Photoshop's UXP host never touches `node_modules`).

- `npm test` — runs the real test suite
- `npm run lint` — ESLint, checks for undefined references, dead code, and other real bug patterns
- `npm run format:check` — Prettier, reports style differences without changing anything
- `npm run format` — Prettier, rewrites files to the configured style (large diff — run deliberately, not part of normal commits)

The suite loads the **actual shipped source files** (`core/*.js`, `engines/*.js`) into
a Node `vm` context and exercises the **real exported functions**. It is not a set of
inline mocks. Highlights:

- A **functional** test calls the halftone integration entry point with a mocked
  Photoshop imaging API and asserts pixels are **read and written** end-to-end, and
  that the written buffer actually contains halftone ink.
- **Regression guards** fail if anyone reintroduces the dead `window.PhotoneshopHalftone`
  global, a `PhotoneshopError.wrap()` call, or a route to the mock tiled renderer.
- A **mutation test** was run during development: reintroducing the v5.2 bug makes the
  functional test and a guard fail (exit code 1). The suite has teeth.

20 tests, all passing against real source. Exit code is non-zero on any failure (CI-ready).

## Install

1. Open the **UXP Developer Tool**.
2. **Add Plugin** → select this folder's `manifest.json`.
3. **Load** into a running Photoshop (2023+ / UXP).

Folder-copy installs do not work; UXP requires sideloading via UDT.

## Status (honest)

| Area | State |
|------|-------|
| Apply halftone (core feature) | **Working**, instrumented, regression-guarded |
| Large-image path | Verified band-chunked path in `computeHalftoneBufferChunked`; single output allocation, practical ceiling ~100 MP |
| Tiled renderer (`engines/halftone-tiled.js`) | **Experimental, unwired.** Real tile math is unit-tested; `applyHalftoneTiled` throws (no real pixel I/O yet) |
| `core/errors.js` safe wrappers (`safeGetPixels`/`safePutPixels`) | Mock placeholders, **not used by any active path** (halftone uses `window.imaging` directly) |
| Separation tab | Stub (trapping/choke planned) |
| Garment Preview tab | Stub |
| UI | 15 tabs |

See `CHANGELOG.md` and `INTEGRATION-REPORT-v5.2.1.md` for detail.

## v5.2.2 note

`guard()` (core/api.js) and the RGB validators gated on `doc.colorModel`, which is `undefined` on real UXP documents — this blocked the halftone button (and every tool) on real RGB documents. Fixed to read `doc.mode`. The v5.2.1 zip shipped before this fix and still had the bug; v5.2.2 is rebuilt and verified from the extracted artifact. Run `node test-suite.js` → 27 passing.
