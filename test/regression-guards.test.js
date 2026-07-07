import { describe, it, expect } from "vitest";
import { readRepoFile } from "./helpers/vm-loader.js";

// Static, source-text regression guards — no vm context needed, these just
// check the shipped files never regress to a previously-fixed bug shape.
describe("Static regression guards", () => {
  it("REGRESSION GUARD: no source file gates on doc.colorModel equality", () => {
    // The exact bug shape: `doc.colorModel === 'RGB'` or `doc.colorModel !== 'RGB'`.
    const files = ["core/api.js", "core/validation.js", "core/errors.js"];
    for (const f of files) {
      const src = readRepoFile(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(
        /doc\.colorModel\s*(===|!==)\s*['"]RGB['"]/.test(src),
        f + " still gates on doc.colorModel equality (the UXP mode bug)"
      ).toBe(false);
    }
  });

  it("REGRESSION GUARD: no CSS color assignment uses the invalid let(--x) typo for var(--x)", () => {
    const files = ["ai/analysis.js", "core/api.js", "core/history.js", "core/preview.js", "ui/panels.js"];
    for (const f of files) {
      const src = readRepoFile(f);
      expect(
        /\blet\(--/.test(src),
        f + ' contains the invalid CSS "let(--x)" typo (should be "var(--x)") — colour styling silently no-ops'
      ).toBe(false);
    }
  });

  it("REGRESSION GUARD: no accidental window.window. double-reference", () => {
    const files = ["engines/print.js", "engines/separation.js", "engines/vintage.js", "core/api.js"];
    for (const f of files) {
      const src = readRepoFile(f);
      expect(/window\.window\./.test(src), f + " contains an accidental window.window. double-reference").toBe(false);
    }
  });
});
