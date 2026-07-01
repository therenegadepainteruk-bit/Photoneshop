# Changelog

## v5.4.7 — Full refactor: dead code, duplication, naming, comments, documentation

A maintainability pass across the whole codebase — no processing algorithm,
Photoshop API sequence, or UI behaviour changed. Verified after every
individual change via `npm run format:check`, `npm run lint`, and
`npm test` (80/80 passing throughout, unmodified).

### Removed — dead code and obsolete helpers

- `core/errors.js` — `safeGetPixels`/`safePutPixels`/`safeReadLayerPixels`/
  `safeWriteLayerPixels`/`validateDocument`/`logError`: mock stubs (each
  had a `// TODO: Implement actual ... when PS API available` and returned
  fake data) that were never called by any real code path — confirmed by
  grep across the whole repo, and already flagged in README as "not used by
  any active path." `PhotoneshopError` (the one thing this file exports that
  IS used, at `engines/halftone.js`'s one real call site) is untouched.
  212 lines → 49.
- `core/validation.js` — `getFirstFailure()` (declared, exported, zero
  references anywhere) and the `fixAction` closures on `validateRGBMode()`/
  `validateLayerUnlocked()` (each just a `console.log` placeholder behind a
  `// TODO`, never invoked — `report.results[x].fixAction` is never called
  anywhere). `canAutoFix`/`fixSuggestion` are kept — `fixSuggestion` is
  genuinely read by `formatValidationReport()`, and `canAutoFix` is
  meaningful metadata even though nothing branches on it yet.
- `core/history.js` — `getLayerTarget()` (declared, exported, zero
  references — `_layerTarget` is read directly by `stampLayer()` instead).
- Root `index.js` — an explicit "legacy stub, no longer used" (its own
  header comment said so); not referenced by `index.html`, only by
  `package.json`'s now-removed `main` field.

### Removed — duplication

- `engines/print.js` — `exportDTG()`/`exportDTF()` were byte-for-byte
  identical batchPlay sequences (duplicate document → mergeVisible → save
  PNG → close), differing only in a handful of strings. Extracted
  `exportFlatPNG(cfg)`; `exportDTG`/`exportDTF` are now two three-line
  callers passing the exact same strings each used before, so every status
  message, modal name, and exported filename suffix is unchanged.

### Renamed — naming consistency

- `core/history.js` — `TAB_GROUPS` → `SOLO_GROUP_NAMES` (also `let` → `const`,
  matching `HISTORY_CAP` next to it — never reassigned). Only referenced
  within this one file (`toggleSolo()`); no cross-file impact. The old name
  read as a generic "list of tabs," when what it actually is is the list of
  layer-group names the footer's Solo button recognises as a target —
  distinct from, and previously easy to confuse with, `core/preview.js`'s
  unrelated `TAB_GROUP` (a tab-number → group-name lookup for live preview).

### Comments — removed internal fix-tracking references

Removed 22 `// FIX 1.2:`/`// FIX 2.6:`-style comments (across `core/api.js`,
`core/preview.js`, `core/history.js`, `core/diagnostics.js`,
`engines/halftone.js`, `engines/halftone-tiled.js`, `ui/panels.js`) and 4
`Solves CONCERN #N` module-header references (`core/memory.js`,
`core/validation.js`, `core/benchmark.js`, `engines/halftone-tiled.js`) —
internal fix/concern numbers from some external tracking list a reader of
this code has no access to, exactly the kind of comment this project's own
stated convention (this CHANGELOG's own commit style, and every comment
written this session) avoids: explain the WHY for a reader encountering the
code fresh, not a pointer to "fix #2.6." Every removed tag's substantive
explanation was kept and rewritten to stand on its own.

### Documentation

- `ARCHITECTURE.md` — fixed `core/errors.js`'s documented API, which showed
  an object-style `new PhotoneshopError({operation, details, ...})`
  constructor that was never real (the actual, tested constructor is
  positional: `new PhotoneshopError(operation, details, cause)`). Rewrote
  the "Integration Checklist" section, which claimed "Errors module wraps
  all PS API calls" (false — one call site), "Validation gates all render
  operations" (false — warn-only), and "Halftone-tiled auto-selected for
  > 16MP" (false — unwired, `applyHalftoneTiled` throws), plus a stale
  > "25 unit tests / 10 integration tests" count. Retitled from "Photoneshop
  > v5.2 Architecture" (stale — this file documents the current architecture,
  > not a snapshot of v5.2) and removed the stale version/date footer.
- `README.md` — removed the Status-table row for the now-deleted
  `safeGetPixels`/`safePutPixels` mocks, and a reference to
  `INTEGRATION-REPORT-v5.2.1.md`, a file that does not exist in this repo
  (confirmed — the only reference to it, now removed, rather than
  fabricating a document to match).
- Module headers (`core/memory.js`, `core/validation.js`,
  `core/benchmark.js`, `engines/halftone-tiled.js`) now say plainly which
  of their exports are wired into the real halftone path versus real,
  tested, but not currently called by anything (the memory pool, the
  benchmark-recording layer beyond the `Benchmark` class itself) — matching
  this project's established "honest status" convention instead of leaving
  that implicit.

### Reviewed and left unchanged

- Folder structure (`core/`, `engines/`, `ai/`, `presets/`, `ui/`) — every
  file's category is coherent with what it does; moving files means
  simultaneously updating `index.html`'s script tags, `core/init-guard.js`,
  `test/helpers/vm-loader.js`, and `ARCHITECTURE.md` with zero live-Photoshop
  test able to catch a mistyped path, for a purely cosmetic reorganisation —
  not a good risk/reward trade for a refactor with "no functional changes"
  as a hard requirement.
- `core/memory.js`'s `allocateBuffer`/`releaseBuffer` (buffer pooling) and
  most of `core/benchmark.js` (`startRecording`/`benchmarkFn`/
  `exportBenchmarks`/`formatBenchmarks`) — real, working, individually
  tested code that simply isn't wired into the halftone/separation engines
  (which allocate buffers directly). Different in kind from the mock `safe*`
  stubs removed above: this is functional, tested infrastructure, not inert
  placeholder code, so removing it would be removing a working capability
  rather than dead code.
- Widely-used short names (`bp`, `modal`, etc.) — renaming for cosmetic
  consistency would touch 100+ call sites across every file for zero
  behavioural benefit; not a safe trade under "no functional changes."
- Every image-processing algorithm, Photoshop API call sequence, and UI
  control — untouched, as required.

## v5.4.6 — Native storage for UI state, preferences, and recent folders

Reviewed all plugin storage. Presets (`presets/index.js`) already used the
correct native mechanism — `window.fs.getDataFolder()` (UXP's per-plugin
persistent data folder, `uxp.storage.localFileSystem`) plus a JSON file —
and that is completely untouched, so existing `presets.json` files load
exactly as before (backwards compatible by construction). What was actually
custom/missing: several bits of UI state reset to hard-coded defaults on
every panel reload, and every export action re-prompted for a destination
folder on every single click with no memory of the last one. Both now use
genuinely native UXP storage.

### Added

- `core/storage.js` — `getUiState(key, fallback)`/`setUiState(key, value)`,
  a thin wrapper over `window.localStorage` (UXP panels support the standard
  browser `localStorage` API for small persistent key/value data — this is
  not the same restriction as UXP's WebView-hosted content, which cannot use
  it; a panel's own HTML isn't loaded inside a WebView). All fields live
  under one `localStorage` key as a single JSON blob, not one key per field.
  Defensive by design: a disabled/unavailable `localStorage`, or corrupt
  JSON from some future format change, makes `getUiState` return the
  caller's fallback rather than throw — a storage failure can never break
  the UI action that triggered it.
- `core/storage.js` — `rememberFolder(kind, folderEntry)`/
  `getRecentFolder(kind)`, wrapping UXP's documented mechanism for
  remembering a folder across plugin reloads without a fresh permission
  dialog every time: `window.fs.createPersistentToken()`/
  `.getEntryForPersistentToken()` (`window.fs` is `uxp.storage.localFileSystem`,
  already exposed by `core/api.js`). The token itself (just a string) is
  stored via the same small UI-state blob above. `getRecentFolder` returns
  `null` — never throws — if nothing was ever remembered, or if the stored
  token can no longer be resolved (folder moved/deleted, or permission
  revoked — the documented, expected failure mode for persistent tokens),
  so callers fall back to prompting exactly like before this feature
  existed.
- `engines/print.js` `resolveExportFolder(kind)` — used by all four export
  actions (`exportSpots`/`exportScreen`/`exportDTG`/`exportDTF`, kinds
  `"spots"`/`"screen"`/`"dtg"`/`"dtf"`, each remembered independently). The
  first export of a kind still prompts via `fs.getFolder()` exactly as
  today; every export after that reuses the remembered folder directly,
  skipping the picker, until the remembered folder becomes invalid, which
  falls back to prompting again automatically. This changes existing
  behaviour deliberately — confirmed with the user before implementing —
  matching how most applications handle "recent export location."
- UI state now persists across panel reloads instead of resetting to
  hard-coded defaults: last active tab (`ui/panels.js` `activateTab()`),
  layer target (`initLayerTarget()`), DT Studio's DTG/DTF mode
  (`initDTStudio()`/`applyDTMode()`), and the Presets tab's last-viewed
  category (`presets/index.js` `initBuiltinCategoryChips()`). Every restore
  path only activates when a value was actually saved — first run (or any
  install predating this feature) leaves today's existing hard-coded
  startup state completely untouched.
- `test/storage.test.js` (16 tests) — the real `getUiState`/`setUiState`
  against a real (Map-backed) `localStorage` (round-trips, merges rather
  than replacing, single storage key, graceful fallback on a disabled/
  throwing `localStorage` or corrupt stored JSON), the real
  `rememberFolder`/`getRecentFolder` against a controllable
  `createPersistentToken`/`getEntryForPersistentToken` mock (round-trips,
  independent per-kind memory, graceful `null` on a stale token, never
  throws even if the underlying token creation fails), and the real
  `resolveExportFolder()` (prompts + remembers on first use, reuses without
  prompting once remembered, a cancelled picker is never remembered, each
  export kind resolved independently).

### Left unchanged

- `presets/index.js`'s `presetFile()`/`loadPresets()`/`persistPresets()`
  (the `presets.json` read/write, `window.fs.getDataFolder()`) — already the
  correct native File System pattern for this larger, structured data;
  changing its format or location risks breaking existing installs'
  presets, which the task explicitly required preserving.
- Favourite settings (`toggleFav()`) — already part of the same
  `presets.json` structure (a `fav` boolean per user preset); no separate
  storage needed.

No image-processing code touched. Verified via `npm run format:check`,
`npm run lint`, and `npm test` (80/80 passing, 16 new).

## v5.4.5 — Undo experience: one History entry per logical action, not one per tick

Reviewed every editing operation for how it's recorded in Photoshop's native
History panel. The four live-preview tabs (Design Studio, Halftone, White
Ink, DT Studio) already wrapped every debounced preview tick in its own
`executeAsModal` call (needed for the live-drag UX), but each of those calls
is, by default, its OWN separate History-panel entry — so dragging a slider
for a few seconds could leave dozens of transient "preview" entries in the
History panel before the user even clicked Apply, exactly the "dozens of
individual undo steps" problem this task described. Every other
document-modifying action (Garment Optimiser, White Ink underbase, Screen
Studio split/separate, DT Studio Apply, exports, Print Doctor's quick fixes,
etc.) was already confirmed atomic — one `executeAsModal` call each — in the
v5.4.1 Photoshop-operations audit, so this pass is specifically about the
live-preview tick problem.

### Added

- `core/api.js` `suspendHistorySuspension(executionContext, name)` /
  `resumeHistorySuspension(suspensionID, finalName)` — thin wrappers around
  Photoshop's own documented mechanism for this
  (`executionContext.hostControl.suspendHistory`/`.resumeHistory`), not
  something this plugin re-implements. While suspended, every document edit
  — even across separate `executeAsModal` calls — coalesces into one History
  entry; `resumeHistory` commits it, and `finalName` renames it to something
  human ("Apply Threshold") instead of the placeholder name suspension
  started with. Both are defensive by design: `suspendHistorySuspension`
  returns `null` (never throws) if `hostControl` is unavailable or the call
  fails, and every caller treats a `null`/absent suspension as "fall back to
  today's one-entry-per-call behaviour" — a coalescing failure can never
  block the actual edit. `resumeHistorySuspension(null, ...)` is a true
  no-op.
- `core/preview.js` `historyActionName()` — a human, verb-first name for the
  coalesced History entry, distinct from the existing `resultLayerName()`
  (used for the committed layer's own name, which favours compact settings
  descriptors like "45lpi 45°"). Maps each live-preview tab's current state
  to a name in the style requested: Design Studio → "Apply Threshold" /
  "Apply Tone Adjustment" / "Apply Vintage Effect" depending on which of its
  three sub-effects changed (reuses the existing `effectGroupName()` logic
  already used for layer grouping); Halftone → "Generate Halftone"; White Ink
  → "Generate White Underbase"; DT Studio → "Ink Reduction" when the ink
  slider is the only one active, else "DTG/DTF Optimisation" (+ "Halftone" if
  the screen step is on).
- `core/preview.js` `_historySuspension` — session state alongside the
  existing `_sourceId`/`_previewId`/`_sourceReady`/`_previewActive`. Started
  on a session's first preview tick (inside `refreshPreview()`'s existing
  "ensure source layer exists" block — suspended _before_ creating the
  source snapshot layer, so that creation is coalesced too), resumed on
  every session-ending path: `applyResult()`'s commit branch (with
  `finalName: historyActionName()` — this is what turns potentially dozens
  of ticks into one clean "Apply Threshold" entry) and `removePreview()`
  (Cancel, tab switch, Reset All, or a document change mid-session via
  `core/events.js` — all funnel through the same function, so all are
  covered by one change). If source-layer creation itself fails after
  suspending, the suspension is resumed immediately in the `catch` before
  re-throwing, so a failed session can never leave history suspended (the
  normal end-of-session paths are gated on `_sourceReady`/`_previewActive`
  becoming true, which a failed session never reaches).
- `engines/halftone.js` `applyHalftoneEngine()` (the Halftone tab's own
  dedicated "Apply halftone" button, independent of the shared preview
  Apply/Cancel bar) now closes out an in-progress preview session first if
  one is open — the same `if (_previewActive || _sourceReady) await
cancelPreview();` guard `resetAll()` already uses — instead of leaving its
  scratch layers (and, now, an open suspension) behind while it starts its
  own separate edit.
- `test/history-suspension.test.js` (15 tests) — the real
  `suspendHistorySuspension`/`resumeHistorySuspension` against a controllable
  `hostControl` mock (correct args passed, graceful `null` on failure/
  unavailability, `resumeHistorySuspension(null, ...)` never calls
  `executeAsModal`, `finalName` is set/omitted correctly, resume failures
  never throw), and the real `historyActionName()` across all four
  live-preview tabs and Design Studio's three sub-effect cases.

Not verified against a live Photoshop/UXP host in this environment — same
honest caveat as every other change in this session that depends on exact
Photoshop host behaviour (Spectrum UI, native event listeners). This one
specifically touches Photoshop's own undo/History subsystem, so it's the
highest-risk change to verify live: drag a slider on each of the four tabs,
click Apply, and confirm the History panel shows one clean entry named as
above (not one per tick); also test Cancel, and ideally a failure case.
Every code path was designed so a coalescing failure degrades to today's
existing (verified, shipping) per-call behaviour rather than blocking or
corrupting an edit — see the "Added" notes above for exactly which paths
guarantee that. 64/64 tests pass (15 new). No image-processing algorithm,
UI, or feature behaviour changed.

## v5.4.4 — Image-processing optimisation: composite reads instead of stamp layers

Reviewed every `window.imaging.getPixels`/`putPixels` call site and every
`mergeVisible`+`duplicate` layer creation across the plugin for cases where a
real, full-resolution layer was being materialised purely to sample pixels
for analysis, when the Imaging API could read the same data directly. No
threshold or halftone algorithm changed — this is purely about how source
pixels are obtained before those algorithms run.

### Changed

- `engines/separation.js` `splitChannels()` and `autoSeparate()` (Colours
  tab "Split into colour layers" and Screen Studio "Auto separate") both
  used to do `bpCreateLayer([{ mergeVisible, duplicate: true }])` → `hide` →
  `getPixels({ layerID, targetSize })` → (k-means / CMYK split) → `delete`,
  purely to obtain a downsampled colour sample for the k-means/CMYK channel
  detection. That sample is immediately discarded — the layer was never
  shown, never edited, never part of the output. Replaced with
  `getPixels({ targetSize })` (no `layerID`) — the same "read the merged,
  currently-visible composite" call already trusted elsewhere in this exact
  codebase (`core/history.js` `samplePixelStats()`, `engines/vintage.js`
  `autoDetectThreshold()`, `ai/analysis.js` `runDeepAnalysis()`). Same
  pixels (Photoshop's own composite render, downsampled to the same
  already-existing `SPLIT_MAX_DIM` cap), same k-means/CMYK algorithm, same
  resulting channel layers — only how the source pixels are obtained
  changed. Removes, per click: one `mergeVisible+duplicate` (one of the more
  expensive operations on a large, many-layer document — it has to
  flatten every visible layer into a new full-resolution layer), one
  `hide`, and one `delete`; and removes the full-resolution layer that used
  to sit in memory for the duration of the k-means pass. Verified with a new
  static regression guard (`test/separation.test.js`) asserting no
  `mergeVisible` remains in the file and both remaining `getPixels()` calls
  are composite reads.

### Reviewed and deliberately left unchanged

- `core/preview.js`'s live-preview source/preview layers (`_sourceId`/
  `_previewId`) — these are not sampling artifacts; they're the actual
  layer the user sees update live in the Photoshop canvas and that becomes
  the committed result on Apply. A real, editable layer is the feature, not
  a wasteful duplication.
- `engines/print.js` `applyDT()`'s and `engines/halftone.js`
  `applyHalftoneEngine()`'s `mergeVisible+duplicate` — these create the
  actual output layer that batchPlay-filters and/or `putPixels` write into
  and that stays in the document afterward; not a discard-after-read sample.
- Photoshop-native adjustment/filter commands (brightness/contrast,
  exposure, gaussian blur, threshold, median, noise, unsharp mask) applied
  via `batchPlay` in `engines/vintage.js`/`engines/print.js` — these already
  run through Photoshop's own optimised native filter pipeline, which is
  faster and more reliably identical-output than a JS reimplementation
  through the Imaging API would be. Not the "layer-based/duplicated" waste
  this pass targeted.
- `engines/halftone.js`'s existing draft/final split
  (`writeHalftonePreview` downsampled + nearest-neighbour upscale for live
  dragging, `writeHalftoneFinal` full chunked resolution on Apply) — already
  exactly the pattern this pass looked for; nothing to change.
- `core/diagnostics.js`'s `mergeVisible+duplicate` + `getPixels(layerID)`
  round trips — these exist specifically to exercise and time the real
  layer-based `getPixels`→`putPixels` pathway itself (Test 4 explicitly
  leaves its result layer for manual visual inspection); replacing them with
  a composite read would defeat their diagnostic purpose.

Verified via `npm run format:check`, `npm run lint`, and `npm test`
(49/49 passing, 1 new regression guard).

## v5.4.3 — Responsiveness: native Photoshop event listeners replace stale-until-next-click UI state

Added `core/events.js`, subscribing once to Photoshop's own notification
events instead of leaving several UI readouts to refresh only reactively
after a user-driven plugin action. No image-processing code touched.

### Added

- `core/events.js` — `initPhotoshopEventListeners()`, called once from
  `ui/panels.js`'s `init()`, registers a single
  `window.action.addNotificationListener(["select", "historyStateChanged",
"open", "close"], handler)`. A module-level guard flag makes repeat calls a
  no-op, so the listener can never be double-registered (repeat calls would
  otherwise double-fire the handler per event).
  - `"select"` covers an active-document switch, a layer selection change, a
    channel selection change, and a pixel-selection change — Photoshop uses
    one event for all four.
  - `"historyStateChanged"` covers any undo/redo/new History-panel state,
    including layer/selection/channel edits that don't themselves change
    what's selected.
  - `"open"`/`"close"` cover document lifecycle.
  - On every one of these events the handler refreshes three readouts that
    previously only updated after a plugin-driven action: the footer's live
    ink-coverage %, Print Doctor's fix-button availability, and the RGB/CMYK
    toggle highlight. Previously, switching the active document, running
    Photoshop's own Undo, or editing a selection/layer/channel with a
    Photoshop tool left these showing stale data until the next slider drag
    or button click.
  - The handler also tracks the active document's id; if it changed since the
    last event **and** a live-preview session was active, it calls the
    existing `cancelPreview()` immediately (a no-op unless a session is
    active) instead of leaving a stale session to surface as a "Preview
    error" the next time a slider on the newly-active document is touched. A
    same-document event (a layer selection or history-state change while
    staying on the same document) does **not** trigger this — verified by
    `test/events.test.js`.
- `test/events.test.js` (7 tests) — loads the real `core/events.js` into an
  isolated vm with stubbed `updateFixAvailability`/`updateColourModeToggle`/
  `updateCoverage`/`cancelPreview`, and asserts: exactly one listener gets
  registered even across repeat `initPhotoshopEventListeners()` calls, the
  handler refreshes all three readouts, `cancelPreview()` only fires on an
  actual document-id change (not on same-document events, not when no
  preview session is active), and the handler never throws even if a
  downstream refresh function does.

### Changed

- `core/preview.js` `schedulePreview()`/`clearPreviewTimer()` — the
  live-preview debounce was a `setInterval` ticking on a fixed clock,
  checking a dirty flag each tick and clearing itself once nothing had
  changed since the last tick. Replaced with a self-rescheduling `setTimeout`
  chain: identical timing (still fires at most once every `DEBOUNCE_MS`
  while a slider keeps moving, still stops itself the first tick nothing's
  dirty), but only ever has one timer pending at a time instead of a
  recurring interval running on its own fixed schedule.

### Deliberately left as-is

- `waitForRenderLock()`'s internal 30ms poll loop (`core/preview.js`) — this
  waits on the plugin's **own** in-flight async render/write, not on any
  Photoshop application state, so there is no Photoshop notification event
  it could subscribe to instead.
- `core/api.js`'s `setStatus()` auto-hide `setTimeout` and
  `core/preview.js`'s `setTimeout(refreshPreview, 0)` — one-shot UI-toast and
  same-tick-coalescing timers, not polling, and not something a Photoshop
  event listener is relevant to.
- The chunked-halftone `setTimeout(r, 0)` yield points in
  `engines/halftone.js`/`engines/halftone-tiled.js` — image-processing
  chunking, out of scope for this change.

Not verified against a live Photoshop/UXP host in this environment — see
README "Status (honest)". Verified via `npm run format:check`, `npm run
lint`, and `npm test` (48/48 passing, 7 new).

## v5.4.2 — Photoshop-communication optimisation: fewer batchPlay round trips

Reviewed every `bp()`/`batchPlay` call site for sequences of separate,
sequential calls that could become one multi-descriptor call — reduces
Photoshop API round trips and redraws without changing output, undo
behaviour, or compatibility. No processing/algorithm or UI code touched.

### Approach

`bp(cmds)` (`core/api.js`) now accepts an optional second `opts` argument
passed straight through to `window.batchPlay` (default `{}`, identical to the
previous hardcoded call). Two mechanical, provably-safe merge rules were
applied, never mixed within one merged call:

1. **Consecutive bare calls** (none had their own `.catch()`, so any one
   failing already aborted every call after it): merged with batchPlay's
   default options — identical abort-on-first-error behaviour, now in one
   round trip.
2. **Consecutive calls that already had independent `.catch(() => {})`**:
   merged using batchPlay's own documented `{ continueOnError: true }` option
   — each command can still fail without blocking the others, exactly as
   before, but as one round trip instead of N.

### Changed

- `core/history.js` `stampLayer()` — merge+rename (2 bare calls → 1).
- `core/history.js` `toggleSolo()` — was one `bp()` call **per layer in the
  document** in a loop; now one call for the whole layer set
  (`continueOnError: true`, same per-layer failure tolerance).
- `core/preview.js` `refreshPreview()` — the live-preview layer's
  show/select/move-to-front (3 calls → 1, `continueOnError: true`). This runs
  on every debounced slider-drag tick, so it's the highest-frequency call site
  in the plugin.
- `core/preview.js` `applyResult()` (commit branch) — delete stale source
  layer + select result (2 calls → 1, `continueOnError: true`).
- `core/preview.js` `removePreview()` — delete preview layer + delete source
  layer (2 calls → 1, `continueOnError: true`).
- `engines/print.js` `applyGarment()` — underbase preserveTransparency/fill/
  move (3 calls → 1, `continueOnError: true`).
- `engines/print.js` `exportScreen()` — duplicate/make-layer/set-name/flatten
  (4 bare calls → 1).
- `engines/print.js` `exportSpots()` — duplicate+flatten (2 bare calls → 1);
  save+close (2 calls → 1, `continueOnError: true`).
- `engines/print.js` `applyDT()` — on the non-halftone path, the tone/colour
  pipeline and the result-layer rename now share one call instead of two
  (unchanged on the halftone path, where a `putPixels` stage sits between them).
- `engines/separation.js` `chokeChannelLayer()` — select+choke (2 calls → 1,
  `continueOnError: true`); called once per channel, so this halves the round
  trips for any separation with a choke value set.

### Deliberately left unmerged

- `core/diagnostics.js` — exists specifically to time each `getPixels`/
  `putPixels`/`batchPlay` stage independently; merging would defeat its
  purpose.
- Any adjacent calls whose error-tolerance didn't already match (e.g. a bare
  call followed by a `.catch()`-guarded one) — merging those would change
  which failures propagate, so they were left as separate round trips.
- `groupSelectedInto()`'s make-layerSection→fallback chain — branching
  fallback logic, not a flat sequence of independent commands.

Verified via `npm run format:check`, `npm run lint`, and `npm test`
(41/41 passing, unmodified) — since none of these transformations touch
processing logic, the existing suite exercising `kMeansColors`, the halftone
render, and the mocked-batchPlay init paths is sufficient to confirm nothing
regressed.

## v5.4.1 — Photoshop-operations audit: atomic history steps, document-conflict guards

Reviewed every function that modifies the document (every `bp()`/`bpCreateLayer()`
call site and every `window.imaging.getPixels`/`putPixels` call site) against
Adobe's `executeAsModal` best practices. No image-processing algorithm, batchPlay
descriptor, or UI markup was touched — this is purely about how operations are
grouped into modal scope and sequenced against the live-preview mechanism.

### Fixed — fragmented undo history

Two user actions each opened **2–3 separate `executeAsModal` calls** for what
is one logical click, which meant Photoshop's native History panel recorded
2 separate undo steps per action instead of 1 (and on the "no colours found"
early-exit path, a 3rd). A single native Ctrl+Z would only partially revert
the action, leaving behind e.g. a re-materialised hidden source-snapshot
layer that needed a second undo to clean up.

- `engines/separation.js` `splitChannels()` (Colours tab "Split into colour
  layers"): was `modal("split source")` → (pure-JS k-means) → `modal("build
channel layers")`. Now one `modal("split into colour layers")` scope; the
  k-means computation (pure JS on an already-downscaled buffer, not a
  Photoshop call) runs inside it without holding up anything real.
- `engines/separation.js` `autoSeparate()` (Screen Studio "Auto separate"):
  same pattern — `modal("separate source")` → (pure-JS CMYK/k-means channel
  build) → `modal("build separations")` merged into one `modal("auto
separate")` scope.
- Both are behaviour-identical: same batchPlay commands, same order, same
  status messages, same early-exit warning on "no opaque pixels found" — only
  the modal-scope boundaries moved. Verified via `test/separation.test.js`
  (unmodified, still 7/7 passing) and a full read-through diff against the
  original command sequence.

### Fixed — missing document-conflict guards

`core/preview.js` already has a `waitForRenderLock()` guard — wait for any
in-flight live-preview render to finish before touching the document — used
by `applyResult()`, `applyHalftoneEngine()`, `applyDT()`, and `cancelPreview()`.
Four more actions reachable while a live-preview render could be mid-write
were missing it:

- `engines/vintage.js` `autoDetectThreshold()` — Design Studio (tab 2, a
  live-preview tab) "Auto-detect optimal threshold" samples pixels via
  `imaging.getPixels()`; a user can drag a slider then immediately click this
  before the debounced preview render finishes.
- `engines/print.js` `generateUnderbase()` — White Ink (tab 6, a live-preview
  tab) "Generate white underbase" stamps a new layer the same way.
- `core/history.js` `undoLast()` and `toggleSolo()` — the footer's Undo and
  Solo buttons are reachable from **any** tab, including the four
  live-preview ones, at any time.

All four now call `await waitForRenderLock();` before their own `modal(...)`
call, exactly mirroring the existing pattern — no new mechanism introduced,
just applied consistently to the functions that were missing it.

### Reviewed and confirmed already correct (no change)

- Every other action function already wraps its Photoshop-modifying calls in
  exactly one `modal(...)` scope.
- Helper functions that call `bp()`/`window.imaging.*` without their own
  `modal()` wrapper (`stampLayer`, `groupSelectedInto`, `writeChannelLayer`,
  `halftoneChannelLayer`, `chokeChannelLayer`, `writeRegistrationMarks`,
  `readLayerPixels`, `writeHalftonePreview`/`writeHalftoneFinal`) are, in
  every call site, only ever invoked from within a caller's existing `modal()`
  scope — correct, since nesting `executeAsModal` calls is not supported.
  Wrapping these individually would have been actively wrong.
- `core/diagnostics.js`'s 4 diagnostic tests intentionally each get their own
  `modal()`/history entry — they're independent, individually-inspectable
  tests (`diagTest4` explicitly leaves its result layer for manual review),
  not one atomic action.
- `applyResult()`'s two `modal()` calls are a mutually-exclusive if/else (only
  one ever runs per call), not a fragmentation case.

## v5.4.0 — UI-only migration to native UXP Spectrum elements

Every custom-styled HTML control is replaced with UXP's built-in Spectrum
custom elements (`sp-*`) — no bundler, no new dependency, no manifest change:
UXP hosts (Photoshop 23.3+, this plugin's declared `minVersion`) render these
tags natively, the same way `<input type="color">` already "just worked."
This keeps the plugin's zero-runtime-dependency architecture (see v5.2.7's
rationale against introducing a build step) — `index.html`'s `<script>` tags
are untouched, only their content changed.

**Scope discipline:** no file under `engines/`, `ai/`, or the halftone/pixel
pipeline had its logic touched. The only edits to `.js` files were the DOM
glue that reads/writes control values (`core/api.js`'s `val`/`num`/`chk`/
`setSlider`/`activeChip`/`selectOne`, `ui/panels.js`'s event wiring, two
dynamically-generated markup strings in `ai/analysis.js` and
`presets/index.js`) — never the batchPlay descriptors, image-processing
math, or Photoshop API calls those functions feed into. Confirmed by: all 41
Vitest tests (which exercise the real engine functions) still pass unmodified.

### Control mapping

| Was                                                                                               | Now                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.nav button` × 14 (custom tab strip)                                                             | `sp-tabs` + `sp-tab` (slotted two-line label, same tag sub-caption)                                                                                                                          |
| `.chip` × 8 groups, `.target-btn` × 3, `.preset-cat-chip` × 3 (hand-rolled single-select buttons) | `sp-action-button` with the `selected` property/attribute driving the pressed state (was a `.on` CSS class)                                                                                  |
| `.btn` / `.btn.primary` × ~34                                                                     | `sp-button` (`variant="cta"` for what was `.primary`, `variant="secondary"` otherwise)                                                                                                       |
| `.mini` (footer Solo/Undo), modal close, preset star/delete                                       | `sp-action-button` (`quiet`)                                                                                                                                                                 |
| `input[type=range]` × 27 + the `.s-fill`/`.s-track` manual fill-bar div/CSS/JS                    | `sp-slider` (renders its own track/fill/thumb — the fill-bar machinery is gone entirely)                                                                                                     |
| `input[type=text]` × 3                                                                            | `sp-textfield` (`type="number"` for the two resize dimensions)                                                                                                                               |
| `<select id="effect">`                                                                            | `sp-dropdown` + `sp-menu`/`sp-menu-item`                                                                                                                                                     |
| `.toggle-switch` (RGB/CMYK sliding 2-way toggle)                                                  | 2 `sp-action-button`s (it's an exclusive choice, not a boolean — doesn't fit `sp-switch`)                                                                                                    |
| 4 `.tog`-wrapped checkboxes (`autoUnderbase`, `dtHalftone`, `sepAutoHalftone`, `sepRegMarks`)     | `sp-switch` (these are boolean feature toggles — the semantically correct Spectrum component)                                                                                                |
| `.deep-progress-bar`/`.deep-progress-fill` manual 2-div fill bar                                  | `sp-progressbar`                                                                                                                                                                             |
| `.modal-card`/`.modal-head h3`/`.modal-close`                                                     | `sp-dialog` + `sp-heading` + `sp-action-button`, inside the **same** `.modal-overlay` backdrop div and open/close JS as before (that logic was already correct and isn't Spectrum's concern) |
| `<input type="color">` (ink colour, channel swatches)                                             | **Unchanged** — not on the requested replacement list, and already a native host control                                                                                                     |

### Removed (obsolete once the native components render their own chrome)

`fillSlider()` and every `#idF` fill-bar element/CSS rule, `.toggle-switch*`/
`.toggle-thumb`, `input[type=range]*` CSS, `select*` CSS, `.chip*`/`.btn*`/
`.tog*`/`.target-btn*`/`.nav button*`/`.preset-cat-chip*`/`.preset-item-btn*`/
`.mini*`/`.bar-reset*`/`.bar-apply*`/`.modal-close*`/`.modal-card`/
`input[type=text]*` CSS (`ui/styles.css` net -390 lines). Layout-only rules
(`.sec`, `.s-row`, `.actions`, `.chips` wrapper, `.hint`, score cards, stat
grids, etc.) are unchanged — those aren't "controls," they're page structure.

### Adapted (same behaviour, new element type)

- `core/api.js`: `activeChip()` now queries `sp-action-button[selected]`
  instead of `.chip.on`; `selectOne()` toggles the `.selected` property
  instead of a CSS class; `setSlider()` no longer calls the deleted
  `fillSlider()`. `val`/`num`/`chk`/`bind` are unchanged — they read generic
  `.value`/`.checked` properties and attach native `click` listeners, which
  Spectrum elements mirror.
- `ui/panels.js`: `initTabs()` rewritten around `sp-tabs`' own `change` event
  and `.selected` property (previously 14 individual click listeners);
  `initChips()`/`initLayerTarget()`/`initDTStudio()` updated to the
  `sp-action-button` selector and property; `initSliders()` drops the
  `fillSlider()` call. Removed two dead selector strings (`#htPattern`,
  `#ditherChips` — elements that never existed in any shipped HTML).
- `ai/analysis.js`: `updateColourModeToggle()` toggles `.selected` on two
  `sp-action-button`s instead of `.on`/`.right` classes; `setBar()` sets
  `sp-progressbar`'s `.progress` property instead of a div's `style.width`;
  the dynamically-generated Deep Analysis progress bar and "Apply these
  halftone settings" button markup updated to match.
- `presets/index.js`: `renderBuiltinPresets()`/`renderUserPresets()` generate
  `sp-action-button` markup instead of `<button>`; `initBuiltinCategoryChips()`
  targets the new `#presetCatChips` container instead of a global
  `.preset-cat-chip` class.

### Honest caveat

This environment has no live Photoshop/UXP host to render against — the
Vitest suite runs in a Node `vm`, not a browser, so it cannot and does not
verify visual rendering or confirm the exact attribute/event names UXP's
Spectrum elements expect (`sp-tabs`' `selected`/`change`, `sp-dropdown`'s
`slot="options"`, `sp-slider`'s clamp-on-assignment behaviour, etc.) are
correct at runtime. These are implemented per Adobe's documented UXP Spectrum
element reference to the best of available knowledge, and the DOM glue is
written defensively (generic `.value`/`.checked` reads, graceful `if (el)`
guards throughout) — but **this needs a pass in a real Photoshop panel
before shipping** to confirm every control renders and responds as intended.

## v5.3.2 — Audit Phase 0: grayscale consistency, dedup, one bad descriptor key

Executes the 4 "safest, no visible behaviour change" items from a full read-only
plugin audit (UI inventory, every batchPlay/executeAsModal call site, Spectrum/
native-UXP replacement candidates, event-usage review, duplication, deprecated
APIs). Phases 1+ (export-function dedup, debounce cleanup, native PS event
listeners, Spectrum Web Components migration, the dual-Apply-button
architecture) are intentionally not part of this change.

### Changed

- **Standardised grayscale/luminance on one formula everywhere.** Five call
  sites (`core/history.js` coverage, `engines/halftone.js` ×2, `ai/analysis.js`
  ×2, `engines/halftone-tiled.js`) averaged `(r+g+b)/3`; only `engines/vintage.js`'s
  Otsu auto-threshold used the perceptually-correct ITU-R BT.601 weighting
  Photoshop's own grayscale conversion uses. New shared `luminance(r,g,b)`
  helper in `core/api.js` is now the single source of truth, used by all 6
  sites (plus the edge-density Sobel-proxy in `runDeepAnalysis()`, a 7th spot
  using the same unweighted formula found while making this change).
  **Real effect:** for genuinely coloured artwork, halftone tone-sampling, ink
  coverage %, and Deep Analysis's histogram/edge stats will shift slightly
  (more accurately) versus before; identical output for already-greyscale
  artwork, since the weights sum to 1.0. The existing halftone functional test
  uses a grey gradient, so it could not have caught this either way — verified
  manually that the formula swap is the only change to `computeHalftoneBuffer`'s
  tone input.
- **Deduplicated ink-coverage pixel sampling.** `core/history.js`'s footer
  readout and `ai/analysis.js`'s Print Doctor each independently sampled
  pixels and counted dark ones. New shared `samplePixelStats(size)` in
  `core/history.js` does the one `getPixels()` pass and returns both ink % and
  colour-cluster count; each caller takes only what it needs.
- **Fixed a wrong batchPlay descriptor key.** Both `imageSize` calls in
  `ai/analysis.js` (`fixUpscale`/`fixResize`) set `interfaceIconFrameDimmed`
  for the resample method — that key belongs to gradient descriptors (used
  correctly elsewhere, `engines/print.js`'s palette-shift gradient map) and
  was almost certainly copy-pasted; Photoshop was silently ignoring it and
  falling back to its own default interpolation instead of the intended
  "Automatic". Corrected to `interpolationMethod`.
- **Extracted the repeated "select one of a button group" pattern.** New
  shared `selectOne(groupSelector, el)` in `core/api.js` replaces five
  hand-duplicated `querySelectorAll(...).forEach(remove "on"); add "on"`
  blocks across `ui/panels.js` (tab nav, generic chip groups, layer-target
  strip, DT Studio mode chips) and `presets/index.js` (preset category chips).

### Tests

- All 41 existing Vitest tests still pass unmodified — the halftone functional
  test's synthetic source is a pure grey gradient, so the luminance formula
  change doesn't (and shouldn't) alter its assertions.
- `core/init-guard.js`'s `assertReady()` load-bearing-globals list updated for
  the two new `core/api.js` exports and one new `core/history.js` export.

## v5.3.1 — Migrated the test suite to Vitest

The custom 27KB `test-suite.js` (hand-rolled `test()`/`assert()` harness) is
replaced by standard Vitest `describe`/`it`/`expect`, split across `test/*.test.js`
by module. Motivation: standardized output, real V8 code coverage reporting,
per-file test isolation, and parallel execution across files — none of which the
custom harness had.

### What changed

- `test-suite.js` deleted. Its logic moved to `test/*.test.js` (11 files, one per
  module/concern — `memory`, `errors`, `validation`, `api-guard`, `benchmark`,
  `halftone-tiled`, `halftone-integration`, `separation`, `init-guard`,
  `source-loading`, `regression-guards`), plus a shared
  `test/helpers/vm-loader.js` extracted from the old suite's vm-loading
  functions (`loadSharedContext`/`loadIsolated`/`loadFullAppIsolated`).
- **The vm-based UXP/Photoshop mocking is unchanged in approach** — tests still
  load the real shipped source files into a Node `vm` context that fakes
  `window`/`document`/`require("photoshop")`/`require("uxp")`, then call the
  real exported functions. Only the assertion/runner layer moved to Vitest;
  the plugin's own logic is still never reimplemented as a mock.
- Each test file now calls `loadSharedContext()`/`loadIsolated()` in its own
  `beforeAll`, giving every file an independent, freshly-loaded vm context
  instead of one context shared by the whole suite — genuine test isolation,
  not just organizational grouping.
- `vm.runInContext(..., { filename })` now passes the **absolute** source path
  instead of a relative one — required for `@vitest/coverage-v8` to correctly
  attribute V8's coverage data (collected per-script by filename) back to the
  real files on disk. Without this, coverage reports every file at 0% despite
  the code actually executing.
- `vitest@3.2.6` / `@vitest/coverage-v8@3.2.6` — pinned to the latest 3.x
  line rather than 4.x, because Vitest 4 requires Node `^20 || ^22 || >=24`,
  which would break the `engines.node: ">=18"` constraint this repo already
  declares and the Node 18 pin in `.github/workflows/ci.yml`.
- `package.json`: `"test"` is now `vitest run`; added `"test:watch"` (Vitest's
  interactive watch mode) and `"test:coverage"` (`vitest run --coverage`).
- `.eslintrc.json`: added a `test/**/*.js` override for `sourceType: "module"`
  (the test files use `import`/`export`; every other file in this repo is a
  classic script, kept at `sourceType: "script"`) and ignores `coverage/`.
- `.gitignore` / `.prettierignore`: added `coverage/` (Vitest's coverage
  output directory).

### Verified

- All 41 tests pass (one fewer than the old suite's 42 — a redundant "did the
  source files load" assertion was dropped since a failed `beforeAll` now
  fails every test in that file with a clear vm error, which is strictly more
  informative than the old single boolean check).
- `npm run lint` / `npm run format:check` both clean.
- Re-ran the same mutation check the old suite's history documents: reverting
  `applyHalftoneWithArch()` to call the dead `window.PhotoneshopHalftone`
  global (the exact v5.2 regression) fails the functional test and a
  regression guard in `test/halftone-integration.test.js`, immediately.
- `npm run test:coverage` produces real per-file percentages (not 0%), thanks
  to the absolute-filename fix above.

## v5.3.0 — DT Studio + Screen Studio; fixed several controls that looked functional but weren't

A functional audit of every slider/chip against where its value is actually read
turned up a handful of controls that appeared to do something but didn't (or did
the wrong thing), plus a tab restructure.

### Tab restructure

- **DT Studio** replaces the separate DTG (tab 9) and DTF (tab 10) tabs. A
  Mode chip (`#dtModeChips`) switches which sliders/chips are shown and which
  pipeline `applyDT()` runs (`engines/print.js`: `buildDTPipeline()` dispatches
  to `buildDTGPipeline()`/`buildDTFPipeline()` via `getDTMode()`/`setDTMode()`).
  New: an opt-in "Halftone Screen" checkbox (`#dtHalftone`, off by default) that
  flattens the DTG/DTF-optimised layer and runs it through the same real
  pixel-based renderer the Halftone tab uses (`writeHalftoneFinal`/
  `writeHalftoneToLayer`) — live preview included.
- **Screen Studio** replaces "Separation" (tab 5) — same engine
  (`engines/separation.js`: `autoSeparate()`), renamed because it already does
  exactly what the name says: split channels and halftone them simultaneously.
- Tabs 11–15 renumbered to 10–14 to absorb the DTG/DTF merge.

### Fixed

- **Design Studio silently applied an unrequested halftone dot pattern.**
  `engines/vintage.js` `buildPipeline()` read `#halftone`/`#htSize`/`#htAngle`/
  `#dotGain` — DOM elements that only exist on the Halftone tab — with no
  control on Design Studio itself to turn it off. Since `#halftone` ("Amount")
  defaults to `value="100"`, every Design Studio apply/preview bolted on an 8px
  round-dot `colorHalftone` filter regardless of what the user touched. Removed
  the step entirely; the dedicated Halftone tab is the correct place for this.
- **Halftone tab's "Amount" and "Dot Size" sliders did nothing.**
  `computeHalftoneBuffer`/`computeHalftoneBufferChunked` never read them — dot
  radius came only from LPI/DPI. Now threaded through as real `sizeFactor`/
  `amountPct` parameters (`readHalftoneSizeFactor()`/`readHalftoneAmountPct()`
  in `engines/halftone.js`), consumed by `writeHalftonePreview`/
  `writeHalftoneFinal`. Missing/empty values default to the old behaviour
  (size ×1, amount 100%), so nothing regresses.
- **White Ink's "Highlight Boost" (`#wHl`) was dead** — `buildWhiteInkPipeline()`
  never read it. Now applies a real brightness lift to the white layer.
- **DTG "Printer" and DTF "Film Type" chips were decorative** — selecting
  Epson/Brother/Kornit or Standard/Matte/Soft/Stretch changed nothing.
  `DTG_PRINTER_PROFILES`/`DTF_FILM_PROFILES` (`engines/print.js`) now apply
  real per-profile multipliers to the ink/white/detail/colour/sharpen sliders.
- **`setSlider()` label/value desync.** Assigning a range input's `.value`
  outside its `min`/`max` silently clamps in the browser, but the adjacent
  `-V` label was set from the raw, un-clamped argument — so a preset like
  "White Cotton" (`wDensity: 0`, slider `min="50"`) showed "0" while the
  slider (and therefore every engine read of it) was actually 50. The label
  is now set from the post-clamp `el.value`.
- **Removed the non-functional Basic/Advanced mode toggle.** `initModeToggle()`
  only flipped its own button's CSS class — no CSS rule or JS anywhere hid or
  revealed anything based on it.
- Deleted `ensureSource()`/`buildPreview()` in `core/preview.js` — dead code
  since the v5.2.7 "FIX 1.5" unified them into `refreshPreview()`; nothing
  called the old pair anymore.

### Tests

- `test-suite.js` unchanged in count (42 tests) but re-verified green — the
  new `sizeFactor`/`amountPct` params default safely when absent from the
  suite's DOM stub, so the existing functional halftone test still asserts
  real ink is written.

## v5.2.8 — Extract inline CSS; kept `<script>` tags as classic scripts (not modules)

`index.html` was ~50KB. Checked what was actually in it before assuming: one `<style>`
block, 22.8KB / 972 lines / 46% of the file — and **zero** inline `<script>` blocks.
Every line of JS was already in the 18 external files; there was nothing to "move."

### Changed

- Extracted the `<style>` block verbatim into `ui/styles.css`, linked via a standard
  `<link rel="stylesheet" href="ui/styles.css" />`. `index.html` dropped from ~49.6KB
  to ~26.9KB. Confirmed byte-for-byte semantically identical after extraction
  (whitespace/comment-normalized diff), then ran it through Prettier — which can now
  actually parse it, being a real `.css` file instead of buried in HTML — confirmed
  that pass was cosmetic-only too.

### Deliberately not changed

- The `<script src="...">` tags stay as plain classic scripts, **not**
  `type="module"`. Verified empirically, not just argued: took the real files this
  change would touch, simulated module-scoping on them (module top-level
  declarations don't attach to `window` — that's the defining behaviour of ES
  modules), and re-ran `core/init-guard.js`'s `assertReady()`. Result: 61 of ~65
  load-bearing cross-file connections vanish immediately (`guard`, `bp`, `setStatus`,
  every engine export, gone). Same platform constraint as v5.2.7, hitting the
  `<script>` tags directly this time instead of import/export syntax inside them.

## v5.2.7 — Initialization safety net (why not ES modules)

Addresses a real, well-founded concern: this codebase relies on ~20 classic `<script>`
files sharing one global scope, where a changed load order or a script that fails to
load can cause a confusing failure far from the actual cause. The natural instinct is
"use ES module import/export instead" — investigated that first, and it's not viable
here, for reasons worth recording:

- Adobe's own UXP documentation is explicit that plugin-authored files don't support
  standard ES `import`/`export`. UXP's own mechanism for including other files is its
  `require()` (CommonJS-style), documented as "not as robust as some other include
  systems."
- A `require()`-based rewrite is still a real option in principle, but it means
  restructuring how every one of ~20 interdependent files loads — and two of them,
  `core/preview.js` and `engines/halftone.js`, genuinely depend on each other (a
  circular dependency). CommonJS handles circular requires in a specific, narrow way
  that would need verifying against a live Photoshop/UXP host — not available here.
  Rewriting the entire loading mechanism of a working, tested plugin on an
  unverifiable platform-compatibility bet isn't a reasonable trade.

### Added

- `core/init-guard.js` — new, isolated, additive file. Declares the load-bearing
  cross-file dependency graph (mirroring `ARCHITECTURE.md`) and checks, once, after
  every script has loaded, that everything expected actually exists. If anything is
  missing, throws a structured `PhotoneshopInitError` naming exactly what's missing
  and which file was supposed to provide it — instead of a cryptic native
  `ReferenceError` (or worse, a silent no-op) deep inside some unrelated feature
  much later.
- `ui/panels.js`: `init()` now calls `assertReady()` first, before wiring up any UI.
  If it throws, the whole panel is replaced with a plain-language "Photoneshop failed
  to start" screen instead of silently not responding to clicks.
- Along the way, hit the same `let`-vs-`window`-property subtlety already found
  earlier in this project (`CMYK_ANGLES`): `EDIT_PANES` and `SLIDER_DEFAULTS` are
  declared with `let`, so — like a real `<script>` tag — they never become `window`
  properties, only shared-lexical-scope bindings. The dynamic `window[name]` check
  structurally can't see them; `init-guard.js` checks those two via direct
  bare-identifier reference instead.

### Tests

- `test-suite.js` now loads the complete real file set (matching `index.html`'s
  actual order) into an isolated context and asserts `assertReady()` passes clean —
  and separately verifies it correctly detects and names 5 different
  deliberately-broken load scenarios. 42 tests total, all green.

## v5.2.6 — Dev tooling: package.json, npm scripts, ESLint + Prettier

Tooling only — no change to plugin runtime behaviour (UXP itself never reads
`package.json`; it's Node-side infrastructure for testing and development).

### Added

- `package.json` — proper project metadata, `private: true` + `UNLICENSED` (this is
  commercial code, not an open-source package), pinned Node engine (`>=18`).
- npm scripts: `npm test` (runs `test-suite.js`), `npm run lint` (ESLint), `npm run
format` / `npm run format:check` (Prettier).
- `package-lock.json` committed for reproducible installs across machines.
- `eslint@8` + `.eslintrc.json` — the exact config already validated in this
  project's audit (every cross-file global this codebase's shared-script-scope
  architecture relies on is declared, so it checks real bug patterns —
  undefined references, duplicate keys, unreachable code, fallthrough,
  assignment-in-condition — without false-flagging the project's own design).
  Runs clean: 0 errors, 0 warnings.
- `prettier@3` + `.prettierrc.json` + `.prettierignore`, tuned to the codebase's
  existing style (2-space indent, double quotes, semicolons). **Not applied yet** —
  `format:check` currently flags formatting differences across most files, since the
  codebase predates this config. Run `npm run format` when ready to normalise; that
  will produce a large style-only diff by design, so it's left as a deliberate,
  opt-in step rather than bundled into this commit.
- `node_modules/` already covered by the existing `.gitignore`.

## v5.2.5 — Real auto colour separation engine (CMYK / Spot / Simulated Process)

Built entirely from public-domain prepress technique and this codebase's own existing,
verified building blocks (k-means colour detection, the halftone render engine, the
`minimum` choke filter already used by White Ink). Not derived from, or referenced
against, any third-party action set or commercial tool.

### Added

- **CMYK mode** — true 4-colour process separation via the standard RGB→CMYK
  subtractive-colour formula, each channel auto-halftoned at the classic C15°/M75°/Y0°/K45°
  prepress angle convention (industry-standard spacing chosen to avoid moiré, used
  for decades across offset and screen printing — not vendor-specific).
- **Spot mode** — existing k-means colour detection, now with automatic per-channel
  halftone at rotated angles (cycling a evenly-spaced angle set) instead of a flat fill.
- **Simulated Process mode** — detected dominant colours snapped to a small fixed
  simulated-ink palette, same auto-halftone treatment.
- **Choke** — new slider; shrinks each channel's ink edges inward so abutting colours
  don't leave a visible gap under registration drift. Reuses the same `minimum` filter
  already used by White Ink choke elsewhere in this codebase.
- **Registration marks** — corner crosshairs written directly via pixel data (the same
  proven `imaging.putPixels` path the halftone engine already uses), on their own layer.
- New "Auto Separate" button on the Separation tab orchestrates all of the above in one
  pass, grouped under a new `AutoSeparation` layer group. Existing "Cycle colour
  palette" / "Ink-saving knockout" quick tools are unchanged and still available.

### Fixed

- **Colour-split layers didn't cover the canvas on documents larger than 1200px.**
  `splitChannels()` (Colours tab) detects colour at a downscaled resolution for k-means
  performance — correct — but was then writing the output layer at that same
  downscaled size instead of the document's real size, so on any typical print-resolution
  document the resulting layers only filled a small corner of the canvas. `writeChannelLayer`
  now upscales to the real document dimensions before writing (nearest-neighbour, same
  approach already used for live halftone preview). Fixes both the existing Colours tab
  and the new Auto Separate engine, which shares this code path.

### Tests

- `test-suite.js` now also loads `engines/separation.js`. Added real functional tests for
  `rgbToCmyk()` (black/white/red sanity checks) and `nearestSimInk()`, plus regression
  guards for the classic angle values and the canvas-coverage upscale fix. 36 tests total,
  all green.

## v5.2.4 — Halftone ink colour is now real (was silently hardcoded to black)

The halftone render functions (`computeHalftoneBuffer` / `computeHalftoneBufferChunked`)
have always accepted `inkR/inkG/inkB` parameters, but both call sites in
`writeHalftonePreview()` and `writeHalftoneFinal()` hardcoded `0, 0, 0` and there was no
colour control anywhere in the Halftone tab's UI — every halftone was black, with no way
to change it.

### Added

- Ink colour picker on the Halftone tab (`#htColor`, reusing the existing channel-row
  style from the Colours tab), defaulting to black.
- Colour picker changes now trigger the live preview, same as every slider.
- Ink colour is included in save/restore for presets and "last used", and is reset to
  black by the Reset button, matching every other Halftone control.
- Shared `hexToRgb()` helper in `core/api.js` (`"#rrggbb"` → `{r,g,b}`, defaults to
  black on anything malformed).

### Notes

- Colour only controls the halftone dot fill. It does not sample or preserve the colour
  of the layer the effect is applied to — pick the colour you want per use, same
  workflow as choosing an ink colour before running a real halftone screen.

## v5.2.3 — UI-layer bug sweep (colour coding, manifest correctness, permissions)

Full read-through of every shipped file (not just the core render path). No render
behaviour changed; all fixes are in the UI/manifest layer that the existing test
suite doesn't cover (it only loads `core/*.js` and `engines/halftone*.js`).

### Fixed

- **Score/warning colour coding was silently broken everywhere it appeared.**
  `ai/analysis.js` set `element.style.color` using the invalid CSS typo
  `"let(--fg)"` / `"let(--warn)"` / `"let(--err)"` instead of `"var(--x)"`. `let`
  is not a CSS function, so every one of these assignments was silently rejected
  by the browser and the text rendered in the default colour instead of the
  intended green/amber/red. This hit four separate places: the Print Doctor score
  (tab 1), the Production Check score (tab 12), the Deep Analysis error message,
  and the Production Check issues/warnings list.
- **`window.window.app`** (double `window.` reference) in `exportScreen`,
  `exportDTG`, and `exportDTF` (`engines/print.js`). Harmless in practice only
  because `window.window === window` in a browser/UXP webview, but it was an
  obvious copy-paste artefact inconsistent with every other export function in
  the same file — cleaned up to `window.app`.
- **`manifest.json` `host.minVersion` was `23.0.0`.** Manifest v5 is only
  officially supported from Photoshop 23.3.0 onward; declaring 23.0.0 as the
  floor understated the real requirement. Corrected to `23.3.0`.
- **`manifest.json` `localFileSystem` was `fullAccess`.** The plugin only ever
  uses `fs.getFolder()` (a user-driven folder picker) and the plugin's own
  sandboxed data folder for presets — both fit under the `request` permission
  level. `fullAccess` was unnecessarily broad for what the code actually does
  and triggers a scarier install-consent prompt for no functional benefit.
  Downgraded to `request`.
- **Production Check (tab 12) could show stale results.** `runProductionCheck()`
  only bailed out if `_doctorResults` had never been populated; if a user ran an
  analysis, then closed the document, then revisited the Production tab, it
  would redisplay the old score with no indication it was stale. Added the same
  `hasDoc()` guard used everywhere else in the codebase.

### Tests

- Two new static regression guards in `test-suite.js`, matching the existing
  "REGRESSION GUARD" convention: one asserts no shipped file contains the
  `let(--x)` CSS typo, one asserts no shipped file contains `window.window.`.
  29 tests total, all green.

## v5.2.2 — Colour-mode gate fixed (headline feature was blocked on real RGB docs)

Critical. A reviewer found that `core/validation.js` and `core/errors.js` gated on
`doc.colorModel === 'RGB'`. Investigation showed `core/api.js` `guard()` did the same —
and `guard()` runs first in `applyHalftoneEngine()` (and every other tool). Real UXP
Photoshop documents expose colour mode as `document.mode` (e.g. "RGBColorMode"), not
`colorModel`, so `doc.colorModel` reads `undefined`; `undefined !== 'RGB'` is true, so
`guard()` returned false and the halftone button (and every tool) was **blocked on every
real document, including RGB ones** — before any render ran.

Note on the prior build: this fix was present in the working tree but the shipped
`v5.2.1` zip was built before it and therefore still contained the bug. The artifact did
not match the source. v5.2.2 is rebuilt from the corrected tree and the package contents
are verified directly from the extracted zip.

### Fixed

- `core/api.js` `guard()`, `core/validation.js` `validateRGBMode`, and `core/errors.js`
  `validateDocument` now read `doc.mode` (with `doc.colorModel` as a defensive fallback),
  normalise to a string, and only treat a document as non-RGB when the mode is **readable
  and clearly not RGB**. An unreadable mode never produces a false RGB failure/block.

### Tests

- Added real tests that feed the actual UXP shape: `validateRGBMode({mode:'RGBColorMode'})`
  must pass, `{mode:'CMYKColorMode'}` must fail, `{}` must not false-fail.
- Added `guard()` tests that load the **real** `core/api.js` in an isolated vm (photoshop/uxp
  stubbed) and assert a real RGB document is NOT blocked, CMYK IS blocked, unreadable is not
  blocked — the test that directly covers the headline-blocking path.
- Added a static guard failing if any of the three files reintroduces a `doc.colorModel`
  equality gate. Mutation-tested: reintroducing the bug fails these tests (suite exits 1).
- 27 tests total, all green against the real source; verified from a fresh extraction.

## v5.2.1 — Halftone integration regression FIXED + real test suite

**Critical fix.** v5.2.0's halftone integration was broken on every click. This
release makes it actually work and adds a test suite that proves it.

### Fixed

- **Apply halftone threw on every invocation.** The integration entry point
  (`applyHalftoneWithArch`) dereferenced `window.PhotoneshopHalftone.applyHalftone`,
  a global that is assigned nowhere in the package, throwing
  `"Original halftone module not loaded"` before reading any pixels. Rewired to call
  the module's own verified `writeHalftoneFinal`. The button works again.
- **Wrong layer shape.** Caller passed `{ _id: layerId }` (no `.bounds`); the wrapper
  read `layer.bounds[2]` → would have thrown even if the global existed. Wrapper now
  takes `(layerId, myGen, onProgress)` and uses the real render which reads bounds
  from the document.
- **Nonexistent error API.** Catch block called `PhotoneshopError.wrap()`, which does
  not exist on the class. Replaced with the real
  `new PhotoneshopError(operation, details, cause)` constructor.
- **Mock tiled renderer in the active path.** Large images routed to
  `applyHalftoneTiled`, whose body read a blank `new Uint8Array(256*256*4) // Mock`,
  hardcoded 256×256, and left the per-tile layer write commented out — it rendered
  nothing. Removed from the active path; the function now throws an explicit
  "experimental / not implemented" error instead of returning a fake success object.

### Changed

- `test-suite.js` **completely rewritten.** It now loads the real `core/*.js` and
  `engines/*.js` via a Node `vm` context and exercises the real exported functions,
  including a functional end-to-end halftone test (mocked imaging, asserts real read +
  write + ink) and static regression guards. Verified with a mutation test:
  reintroducing the v5.2 bug fails the suite (exit 1). 20 tests, all green on real source.
- `manifest.json` version → `5.2.1`.
- Docs corrected: tiled renderer disclosed as experimental/unwired; `errors.js` safe
  wrappers disclosed as unused mocks.

### Removed

- `engines/halftone.js.bak` (stray backup that should not have shipped).

### Known limitations (unchanged, disclosed)

- Large-image halftone uses the band-chunked path with one full-size output buffer
  (practical ceiling ~100 MP). The tiled renderer that would remove this ceiling is
  not yet functional.
- Separation and Garment Preview tabs are stubs.

---

## v5.2.0 — Integration attempt (BROKEN — superseded by 5.2.1)

- Added integration layer + architectural modules, but the halftone button path
  referenced an unassigned global and failed on every click. Test suite was inline
  mocks that passed regardless of the real code. Do not use.

## v5.1.0 — Architectural modules built (not yet wired)

- `core/memory.js`, `core/errors.js`, `core/validation.js`, `core/benchmark.js`,
  `engines/halftone-tiled.js` added as standalone modules.

## v5.0.0 — Base platform

- 15-tab garment-print platform, 25 printer presets, non-destructive layer ops,
  live halftone preview, functional halftone via `writeHalftoneFinal`.
