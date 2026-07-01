import { describe, it, expect, beforeEach } from "vitest";
import vm from "node:vm";
import path from "node:path";
import { ROOT, readRepoFile } from "./helpers/vm-loader.js";

// Builds a minimal, isolated sandbox exposing only what core/events.js reads
// as bare globals (matching the classic shared-<script>-scope architecture:
// core/api.js's hasDoc/window.action, core/preview.js's cancelPreview/
// _previewActive/_sourceReady, ai/analysis.js's updateFixAvailability/
// updateColourModeToggle, core/history.js's updateCoverage) — stubbed here so
// this test exercises the REAL core/events.js in isolation from those files.
function buildSandbox() {
  const calls = { cancelPreview: 0, updateFixAvailability: 0, updateColourModeToggle: 0, updateCoverage: 0 };
  const registered = [];
  let capturedHandler = null;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: {
      app: { documents: [], activeDocument: null },
      action: {
        addNotificationListener(events, handler) {
          registered.push(events);
          capturedHandler = handler;
        },
      },
    },
    hasDoc: () => sandbox.window.app.documents.length > 0,
    cancelPreview: async () => {
      calls.cancelPreview++;
    },
    updateFixAvailability: () => {
      calls.updateFixAvailability++;
    },
    updateColourModeToggle: () => {
      calls.updateColourModeToggle++;
    },
    updateCoverage: () => {
      calls.updateCoverage++;
    },
    _previewActive: false,
    _sourceReady: false,
    Promise,
    Error,
    Object,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("core/events.js"), context, { filename: path.join(ROOT, "core/events.js") });
  return {
    context,
    sandbox,
    calls,
    registered,
    getHandler: () => capturedHandler,
  };
}

describe("core/events.js — native Photoshop event listeners (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildSandbox();
  });

  it("registers exactly one addNotificationListener with the documented event set", () => {
    env.context.initPhotoshopEventListeners();
    expect(env.registered.length).toBe(1);
    expect(env.registered[0]).toEqual(["select", "historyStateChanged", "open", "close"]);
  });

  it("does NOT register a second listener on a repeat call (no duplicate listeners)", () => {
    env.context.initPhotoshopEventListeners();
    env.context.initPhotoshopEventListeners();
    env.context.initPhotoshopEventListeners();
    expect(env.registered.length).toBe(1);
  });

  it("the handler refreshes coverage/fix-availability/colour-mode readouts on every event", async () => {
    env.context.initPhotoshopEventListeners();
    env.sandbox.window.app.documents = [{}];
    env.sandbox.window.app.activeDocument = { id: 1 };
    await env.getHandler()();
    expect(env.calls.updateFixAvailability).toBe(1);
    expect(env.calls.updateColourModeToggle).toBe(1);
    expect(env.calls.updateCoverage).toBe(1);
  });

  it("cancels a live preview session when the active document actually changed", async () => {
    env.context.initPhotoshopEventListeners();
    env.sandbox.window.app.documents = [{}];
    env.sandbox.window.app.activeDocument = { id: 1 };
    await env.getHandler()(); // establishes doc 1 as the last-known document
    env.sandbox._previewActive = true;

    env.sandbox.window.app.activeDocument = { id: 2 }; // user switched to a different document
    await env.getHandler()();
    expect(env.calls.cancelPreview).toBe(1);
  });

  it("does NOT cancel an active preview when the document did not change (e.g. a layer/selection event)", async () => {
    env.context.initPhotoshopEventListeners();
    env.sandbox.window.app.documents = [{}];
    env.sandbox.window.app.activeDocument = { id: 1 };
    await env.getHandler()(); // establishes doc 1 as the last-known document
    env.sandbox._previewActive = true;

    await env.getHandler()(); // still doc 1 — e.g. a layer selection or history event
    expect(env.calls.cancelPreview).toBe(0);
  });

  it("does not cancel when no preview session is active, even if the document changes", async () => {
    env.context.initPhotoshopEventListeners();
    env.sandbox.window.app.documents = [{}];
    env.sandbox.window.app.activeDocument = { id: 1 };
    await env.getHandler()();

    env.sandbox.window.app.activeDocument = { id: 2 };
    await env.getHandler()();
    expect(env.calls.cancelPreview).toBe(0);
  });

  it("never throws even if a downstream refresh function throws (best-effort)", async () => {
    env.context.initPhotoshopEventListeners();
    env.sandbox.updateCoverage = () => {
      throw new Error("boom");
    };
    await expect(env.getHandler()()).resolves.toBeUndefined();
  });
});
