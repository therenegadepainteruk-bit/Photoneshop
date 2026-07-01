# Photoneshop v5.4.6

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

80 tests across 14 files, all passing against real source. Exit code is non-zero on
any failure (CI-ready).

## Install

1. Open the **UXP Developer Tool**.
2. **Add Plugin** → select this folder's `manifest.json`.
3. **Load** into a running Photoshop (2023+ / UXP).

Folder-copy installs do not work; UXP requires sideloading via UDT.

## Status (honest)

| Area                                                             | State                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apply halftone (core feature)                                    | **Working**, instrumented, regression-guarded                                                                                                                                                                      |
| Large-image path                                                 | Verified band-chunked path in `computeHalftoneBufferChunked`; single output allocation, practical ceiling ~100 MP                                                                                                  |
| Tiled renderer (`engines/halftone-tiled.js`)                     | **Experimental, unwired.** Real tile math is unit-tested; `applyHalftoneTiled` throws (no real pixel I/O yet)                                                                                                      |
| `core/errors.js` safe wrappers (`safeGetPixels`/`safePutPixels`) | Mock placeholders, **not used by any active path** (halftone uses `window.imaging` directly)                                                                                                                       |
| Screen Studio tab (was "Separation")                             | **Working** — channel split + simultaneous per-channel halftone; advanced spread/vector crop marks planned                                                                                                         |
| DT Studio tab (was "DTG" + "DTF")                                | **Working** — combined DTG/DTF optimisation with an opt-in halftone-screen finishing step (real pixel renderer)                                                                                                    |
| Garment Preview tab                                              | Stub                                                                                                                                                                                                               |
| UI                                                               | 14 tabs, native UXP Spectrum elements (`sp-*`) — **not yet verified in a live Photoshop panel**, see v5.4.0 note                                                                                                   |
| Photoshop-op wrapping (`executeAsModal`)                         | Every document-modifying action audited; all wrap in one atomic modal scope, live-preview races guarded                                                                                                            |
| Photoshop-op batching (`batchPlay`)                              | Redundant sequential calls folded into single multi-descriptor calls where safe (see v5.4.2 note)                                                                                                                  |
| Native event listeners (`core/events.js`)                        | Coverage/fix-availability/RGB-CMYK readouts sync on PS select/historyStateChanged/open/close — see v5.4.3 note, **not yet verified in a live Photoshop panel**                                                     |
| Pixel sampling (Colours/Screen Studio colour detection)          | Reads the composite directly via the Imaging API — no throwaway full-resolution stamp layer (see v5.4.4 note)                                                                                                      |
| Undo / History panel                                             | Live-preview sessions coalesce to one named entry ("Apply Threshold", "Generate Halftone", …) instead of one per drag tick — see v5.4.5 note, **highest-risk change to verify live, see note**                     |
| Storage (presets, UI state, recent folders)                      | Presets: unchanged native `presets.json` file. UI state (last tab, layer target, DT mode, preset category) and per-export "recent folder" memory now use native `localStorage`/persistent tokens — see v5.4.6 note |

See `CHANGELOG.md` and `INTEGRATION-REPORT-v5.2.1.md` for detail.

## v5.4.6 note

Reviewed all plugin storage. Presets already used the correct native
mechanism (`window.fs.getDataFolder()` + `presets.json`) and are completely
untouched — existing preset files keep loading exactly as before. Added
`core/storage.js` for what was missing: `getUiState`/`setUiState` (native
`window.localStorage`, one small JSON blob) now remember the last active
tab, layer target, DT Studio mode, and Presets tab category across panel
reloads — previously these reset to hard-coded defaults every time. Every
restore only activates once a value has actually been saved, so a fresh
install behaves identically to before. Also added `rememberFolder`/
`getRecentFolder` (native persistent file-system tokens —
`window.fs.createPersistentToken()`/`.getEntryForPersistentToken()`) so the
four export actions (Screen/DTG/DTF/Spot) remember their destination folder
after the first use and reuse it directly on later exports instead of
showing the folder picker every single click — this is a deliberate
behaviour change, confirmed with the user before building it. No image-
processing code touched; 80/80 tests pass (16 new).

## v5.4.5 note

Dragging a slider on any of the four live-preview tabs (Design Studio,
Halftone, White Ink, DT Studio) used to leave one Photoshop History-panel
entry per debounced preview tick — potentially dozens for one drag — because
each tick is its own `executeAsModal` call, and Photoshop records one History
entry per call by default. Now the whole session (every tick, plus the final
Apply) is wrapped in Photoshop's own documented `hostControl.suspendHistory`/
`.resumeHistory` mechanism, so it collapses to exactly ONE entry, named for
what actually happened: "Apply Threshold", "Apply Tone Adjustment", "Apply
Vintage Effect" (Design Studio, depending which of its three sub-effects
changed), "Generate Halftone", "Generate White Underbase", or "Ink
Reduction"/"DTG Optimisation"/"DTF Optimisation" (DT Studio). Cancelling
resumes (closes) the suspension too, so it can never be left open. Every
other action was already confirmed to produce one clean entry per click in
the v5.4.1 audit — this pass specifically targeted the live-preview tick
problem. **Honest caveat:** this is the highest-risk change in the project so
far to verify without a live Photoshop host, since it touches Photoshop's own
undo subsystem directly — every path was designed to fail safe (a
coalescing failure falls back to today's shipping one-entry-per-tick
behaviour rather than blocking or corrupting an edit), but please drag a
slider on each tab, click Apply, and check the History panel before relying
on this. See `CHANGELOG.md` for the full design and exactly which failure
paths are covered.

## v5.4.4 note

`splitChannels()` and `autoSeparate()` (Colours tab / Screen Studio) used to
create a real, full-resolution `mergeVisible+duplicate` layer purely to
sample colours for k-means/CMYK detection, then hide and delete it —
expensive on a large, many-layer document, since `mergeVisible` has to
flatten every visible layer into a new full-size layer just to be
immediately downsampled and thrown away. Both now call
`imaging.getPixels({ targetSize })` directly on the composite — the same
no-layer composite read already used by the footer's ink-coverage readout,
Design Studio's auto-threshold, and Print Doctor's deep scan. Same pixels,
same k-means/CMYK algorithm, same resulting channel layers; one fewer
`mergeVisible`/`hide`/`delete` round trip and no throwaway full-resolution
layer in memory per click. No threshold or halftone algorithm touched — see
`CHANGELOG.md` for what else was reviewed (the live-preview layers, the
halftone draft/final split, and the native-filter pipelines) and left
unchanged because a real layer is genuinely required there.

## v5.4.3 note

Added `core/events.js`: a single `window.action.addNotificationListener(["select",
"historyStateChanged", "open", "close"], handler)`, registered once (guarded
against double-registration) from `ui/panels.js`'s `init()`. Previously, the
footer's live ink-coverage %, Print Doctor's fix-button availability, and the
RGB/CMYK toggle only refreshed after a plugin-driven action (a slider drag, an
Apply click) — switching documents, running Photoshop's own Undo, or editing a
selection/layer/channel with a Photoshop tool left them stale until the next
plugin interaction. They now refresh on the native event instead. The handler
also proactively tears down a live-preview session if the active document
changed underneath it, rather than letting it surface as a "Preview error" on
the next slider move. Also replaced `core/preview.js`'s `setInterval`-based
preview debounce with a self-rescheduling `setTimeout` chain — identical
timing, no recurring timer. No image-processing code touched; 48/48 tests
pass (7 new, in `test/events.test.js`). **Honest caveat:** as with the v5.4.0
Spectrum migration, there's no live Photoshop/UXP host available to test
against in this environment — the exact event names (`select`,
`historyStateChanged`, `open`, `close`) are Photoshop's long-established,
widely-used Action Manager event names, not confirmed by seeing them fire in
a real panel. Load the plugin in real Photoshop and switch documents/undo/
select layers to confirm before shipping.

## v5.4.2 note

Reviewed every `batchPlay` call site for sequences of separate, back-to-back
calls that could be folded into one multi-descriptor call — fewer Photoshop
round trips, fewer redraws, same result. Two safe patterns, applied only where
the merged commands' error-handling already matched exactly:

- **Runs of bare calls** (none had their own `.catch()`, so any one failing
  already aborted the rest): merged with batchPlay's default options — e.g.
  `stampLayer()`'s merge+rename, `exportScreen()`'s duplicate/make-layer/
  set-name/flatten, `exportSpots()`'s duplicate+flatten.
- **Runs of calls that already had independent `.catch(() => {})`**: merged
  using batchPlay's own documented `continueOnError: true` option, which gives
  the exact same "any one can fail without blocking the rest" behaviour in one
  round trip instead of N — e.g. the footer's Solo button (was one call per
  layer in the document), the live-preview tick's show/select/move-to-front
  (runs on every debounced slider drag), White Ink's underbase fill sequence,
  Screen Studio's per-channel choke, and preview cleanup/commit.

`core/diagnostics.js` was deliberately left untouched — it exists specifically
to time each `getPixels`/`putPixels`/`batchPlay` stage independently, so
merging its calls would defeat its purpose. No processing/algorithm or UI
changes; all 41 tests pass unmodified.

## v5.4.1 note

Audited every Photoshop-modifying operation against `executeAsModal` best
practices (no processing/algorithm changes). Fixed two actions that opened
2–3 separate modal scopes for one logical click — `splitChannels()` and
`autoSeparate()` — which fragmented a single undo into 2 native History
states; each is now one atomic scope. Added the existing `waitForRenderLock()`
document-conflict guard (already used by Apply/Halftone/DT Studio) to four
more actions reachable while a live-preview render could be mid-write:
Design Studio's auto-threshold, White Ink's underbase generator, and the
footer's Undo/Solo buttons (reachable from any tab). See `CHANGELOG.md` for
the full list of what was reviewed and confirmed already correct.

## v5.4.0 note

Every custom-styled control (buttons, sliders, text fields, the dropdown, tabs,
toggles, the progress bar, the dialog) was replaced with UXP's native Spectrum
elements (`sp-button`, `sp-slider`, `sp-textfield`, `sp-dropdown`, `sp-tabs`,
`sp-switch`, `sp-action-button`, `sp-progressbar`, `sp-dialog`) — a UI-only
change, no `engines/`/`ai/` logic touched, all 41 tests still pass. **Honest
caveat:** there's no live Photoshop/UXP host available to render against in
this environment, so the exact attribute/event names these elements expect
(`sp-tabs`' `change` event, `sp-dropdown`'s `slot="options"`, etc.) are
implemented from documentation, not confirmed by seeing them render. Load the
panel in real Photoshop and check every tab before shipping. See
`CHANGELOG.md` for the full control-by-control mapping.

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
