# Photoneshop v5.3.2

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

## Tests — `npm test` (Vitest)

First time: `npm install` (installs Vitest + ESLint + Prettier as dev tooling; the
plugin itself has zero runtime dependencies — Photoshop's UXP host never touches
`node_modules`).

- `npm test` — runs the real test suite once (`vitest run`)
- `npm run test:watch` — Vitest's interactive watch mode, for local development
- `npm run test:coverage` — runs the suite with V8 code coverage (`coverage/` — gitignored)
- `npm run lint` — ESLint, checks for undefined references, dead code, and other real bug patterns
- `npm run format:check` — Prettier, reports style differences without changing anything
- `npm run format` — Prettier, rewrites files to the configured style (large diff — run deliberately, not part of normal commits)

The suite lives in `test/*.test.js` (standard Vitest `describe`/`it`/`expect`) and
loads the **actual shipped source files** (`core/*.js`, `engines/*.js`) into a Node
`vm` context via `test/helpers/vm-loader.js` — the vm mocks the UXP/Photoshop host
(`window`, `document`, `require("photoshop")`/`require("uxp")`), then the tests
exercise the **real exported functions**. It is not a set of inline mocks of the
plugin's own logic — only the surrounding Photoshop/UXP environment is faked.
Each test file loads its own fresh vm context in a `beforeAll`, so test files are
isolated from each other. Highlights:

- A **functional** test calls the halftone integration entry point with a mocked
  Photoshop imaging API and asserts pixels are **read and written** end-to-end, and
  that the written buffer actually contains halftone ink.
- **Regression guards** fail if anyone reintroduces the dead `window.PhotoneshopHalftone`
  global, a `PhotoneshopError.wrap()` call, or a route to the mock tiled renderer.
- Verified during migration that the suite still has teeth: reintroducing the v5.2
  dead-global bug fails the functional test and a regression guard immediately.

41 tests across 11 files, all passing against real source. Exit code is non-zero on
any failure (CI-ready).

## Install

1. Open the **UXP Developer Tool**.
2. **Add Plugin** → select this folder's `manifest.json`.
3. **Load** into a running Photoshop (2023+ / UXP).

Folder-copy installs do not work; UXP requires sideloading via UDT.

## Status (honest)

| Area                                                             | State                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Apply halftone (core feature)                                    | **Working**, instrumented, regression-guarded                                                                     |
| Large-image path                                                 | Verified band-chunked path in `computeHalftoneBufferChunked`; single output allocation, practical ceiling ~100 MP |
| Tiled renderer (`engines/halftone-tiled.js`)                     | **Experimental, unwired.** Real tile math is unit-tested; `applyHalftoneTiled` throws (no real pixel I/O yet)     |
| `core/errors.js` safe wrappers (`safeGetPixels`/`safePutPixels`) | Mock placeholders, **not used by any active path** (halftone uses `window.imaging` directly)                      |
| Screen Studio tab (was "Separation")                             | **Working** — channel split + simultaneous per-channel halftone; advanced spread/vector crop marks planned        |
| DT Studio tab (was "DTG" + "DTF")                                | **Working** — combined DTG/DTF optimisation with an opt-in halftone-screen finishing step (real pixel renderer)   |
| Garment Preview tab                                              | Stub                                                                                                              |
| UI                                                               | 14 tabs                                                                                                           |

See `CHANGELOG.md` and `INTEGRATION-REPORT-v5.2.1.md` for detail.

## v5.3.0 note

Restructured two tabs and fixed several controls that looked functional but weren't:

- **DT Studio** replaces the separate DTG and DTF tabs — a Mode chip switches
  between them, and a new "Halftone Screen" toggle runs the real pixel-based
  halftone renderer (the same one the Halftone tab uses) on the flattened,
  already-optimised output.
- **Screen Studio** replaces "Separation" (same engine — channel splitting with
  simultaneous per-channel halftone — just renamed to match how it's actually used).
- Fixed: Design Studio (tab 2) was silently baking an 8px round-dot halftone into
  every apply, because its pipeline read the Halftone tab's Amount/Dot Size/Angle
  sliders by DOM id with no way to turn it off from Design Studio itself. Removed.
- Fixed: the Halftone tab's "Amount" and "Dot Size" sliders now actually affect
  the render (previously read by nothing).
- Fixed: White Ink's "Highlight Boost" slider, and DT Studio's printer/film chips,
  were decorative — now applied as real adjustments.
- Fixed: `setSlider()` could show a label that didn't match the slider's actual
  (browser-clamped) value when a preset requested an out-of-range number.
- Removed the non-functional Basic/Advanced mode toggle (changed only its own
  button state; nothing in the plugin ever read it).

## v5.2.2 note

`guard()` (core/api.js) and the RGB validators gated on `doc.colorModel`, which is `undefined` on real UXP documents — this blocked the halftone button (and every tool) on real RGB documents. Fixed to read `doc.mode`. The v5.2.1 zip shipped before this fix and still had the bug; v5.2.2 is rebuilt and verified from the extracted artifact. Run `node test-suite.js` → 27 passing.
