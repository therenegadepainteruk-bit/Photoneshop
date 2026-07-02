/**
 * Ambient declarations for this project's shared-script-scope architecture.
 *
 * Every file under core/, engines/, ai/, presets/, ui/ is loaded as a plain
 * <script> tag (no bundler, no ES modules — see index.html and
 * ARCHITECTURE.md) and shares one global scope at runtime, the same way
 * .eslintrc.json's own "globals" list documents this for ESLint. Most
 * cross-file globals are already visible to tsc automatically, the same
 * way they're visible to every other <script> at runtime, because a plain
 * .js file with no import/export is global-scoped. core/api.js is the one
 * exception: it calls require("photoshop")/require("uxp") (UXP's own
 * global require, not Node's), which makes tsc infer it as an isolated
 * CommonJS module — so its top-level functions need restating here to stay
 * visible to every other file, exactly as they are at runtime. Also covers
 * the handful of values that only ever exist as `window.X` assignments
 * (window.app/action/core/imaging/batchPlay/fs, the other core/*.js
 * "PhotoneshopX" namespace objects) — TypeScript doesn't infer a bare
 * global from a `window.x = ...` assignment the way a real browser does.
 *
 * Typed `any` throughout: there is no official UXP/Photoshop type package
 * in use here, so precise signatures would be guesses, not verified types.
 * checkJs still catches real bugs *within* each file's own local logic
 * (typos, unreachable code, bad control flow, wrong property access on
 * locally-typed values) — this file only prevents false "does not exist"
 * noise for the handful of names tsc can't otherwise resolve. Keep the
 * function list below in sync with core/api.js's own top-level functions
 * if any are added, renamed, or removed there.
 */

declare function require(id: string): any;

// UXP's own globals — not real npm packages, no type declarations exist for
// them; declared as ambient modules purely so require("photoshop")/
// require("uxp") resolve instead of erroring "cannot find module".
declare module "photoshop" {
  const mod: any;
  export = mod;
}
declare module "uxp" {
  const mod: any;
  export = mod;
}

// A UXP Photoshop Layer reference (batchPlay _id/document-layer object) —
// no official type package is in use here, so this is a permissive alias
// rather than a guessed-at precise shape.
type Layer = any;

interface Window {
  app: any;
  core: any;
  action: any;
  imaging: any;
  batchPlay: any;
  fs: any;
  PhotoneshopMemory: any;
  PhotoneshopBenchmark: any;
  PhotoneshopErrors: any;
  PhotoneshopValidation: any;
  PhotoneshopHalftoneIntegrated: any;
  PhotoneshopHalftoneTiled: any;
  PhotoneshopInit: any;
}

declare var fs: any;
declare var imaging: any;

// Chrome/CEF's non-standard performance.memory (heap-size diagnostics) —
// not part of the standard DOM lib's Performance interface.
interface Performance {
  memory: any;
}

// document.getElementById()/querySelector() return the generic
// HTMLElement/Element/EventTarget base types, but this codebase reads
// straight off them (sp-textfield/sp-checkbox/sp-dropdown Spectrum Web
// Component properties, plain <input>/<option> properties, and
// event.target/currentTarget in native DOM event handlers) the same way
// any plain-JS DOM script does, without per-call-site casts to a specific
// subtype. Augmenting these three base interfaces once here reflects that
// existing, working runtime access pattern instead of requiring an
// `as HTMLInputElement`-style cast at every one of the ~30 call sites.
interface EventTarget {
  dataset: any;
  value: any;
  checked: any;
  selected: any;
  disabled: any;
  textContent: any;
}
interface Element {
  dataset: any;
}
interface HTMLElement {
  value: any;
  checked: any;
  selected: any;
  disabled: any;
  progress: any;
  selectedIndex: any;
}

// core/api.js top-level functions — see file comment above.
declare function guard(...args: any[]): any;
declare function hasDoc(...args: any[]): any;
declare function getDoc(...args: any[]): any;
declare function modal(...args: any[]): any;
declare function bp(...args: any[]): any;
declare function bpCreateLayer(...args: any[]): any;
declare function suspendHistorySuspension(...args: any[]): any;
declare function resumeHistorySuspension(...args: any[]): any;
declare function activeLayerId(...args: any[]): any;
declare function setStatus(...args: any[]): any;
declare function bind(...args: any[]): any;
declare function val(...args: any[]): any;
declare function num(...args: any[]): any;
declare function chk(...args: any[]): any;
declare function activeChip(...args: any[]): any;
declare function hexToRgb(...args: any[]): any;
declare function opBright(...args: any[]): any;
declare function opGaussian(...args: any[]): any;
declare function opMedian(...args: any[]): any;
declare function opNoise(...args: any[]): any;
declare function opThreshold(...args: any[]): any;
declare function opExposure(...args: any[]): any;
declare function opHalftone(...args: any[]): any;
declare function opUnsharp(...args: any[]): any;
declare function setWriteInProgress(...args: any[]): any;
declare function getWriteInProgress(...args: any[]): any;
declare function setSlider(...args: any[]): any;
declare function luminance(...args: any[]): any;
declare function selectOne(...args: any[]): any;
