# Changelog

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
