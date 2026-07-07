import { describe, it, expect, beforeEach } from "vitest";
import vm from "node:vm";
import path from "node:path";
import { ROOT, readRepoFile } from "./helpers/vm-loader.js";

// core/api.js's suspendHistorySuspension()/resumeHistorySuspension() wrap
// Photoshop's own executionContext.hostControl.suspendHistory/.resumeHistory
// (the documented mechanism for coalescing many executeAsModal calls into one
// History-panel entry). Loads the REAL core/api.js into an isolated vm with a
// controllable executeAsModal mock that passes a fake executionContext
// through, exactly like the real host does.
function buildApiSandbox() {
  const hostControlCalls = { suspendHistory: [], resumeHistory: [] };
  let suspendHistoryImpl = async (opts) => {
    hostControlCalls.suspendHistory.push(opts);
    return { documentID: opts.documentID, name: opts.name };
  };
  let resumeHistoryImpl = async (suspensionID) => {
    hostControlCalls.resumeHistory.push(suspensionID);
  };
  const fakePhotoshop = {
    app: { documents: [{}], activeDocument: { id: 42 } },
    core: {
      executeAsModal: async (fn) => {
        const executionContext = {
          hostControl: {
            suspendHistory: (opts) => suspendHistoryImpl(opts),
            resumeHistory: (suspensionID) => resumeHistoryImpl(suspensionID),
          },
        };
        return fn(executionContext);
      },
    },
    action: { batchPlay: async () => [] },
    imaging: {},
  };
  const fakeUxp = { storage: { localFileSystem: {} }, entrypoints: { setup: () => {} } };
  const elStub = () => ({ classList: { add() {}, remove() {} }, className: "", textContent: "", value: "" });
  const sandbox = {
    require: (m) => (m === "photoshop" ? fakePhotoshop : m === "uxp" ? fakeUxp : {}),
    window: {},
    document: { getElementById: () => elStub() },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => fn(),
    Math,
    JSON,
    Date,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    parseFloat,
    parseInt,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("core/api.js"), context, { filename: path.join(ROOT, "core/api.js") });
  return {
    context,
    fakePhotoshop,
    hostControlCalls,
    setSuspendHistoryImpl: (fn) => {
      suspendHistoryImpl = fn;
    },
    setResumeHistoryImpl: (fn) => {
      resumeHistoryImpl = fn;
    },
  };
}

describe("core/api.js — suspendHistorySuspension()/resumeHistorySuspension() (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildApiSandbox();
  });

  it("suspendHistorySuspension calls hostControl.suspendHistory with the active document's id and the given name", async () => {
    const suspensionID = await env.context.suspendHistorySuspension({ hostControl: null }, "ignored");
    // executionContext passed directly here has no hostControl -> null, no PS call.
    expect(suspensionID).toBeNull();
    expect(env.hostControlCalls.suspendHistory.length).toBe(0);
  });

  it("suspendHistorySuspension, called from inside modal(), reaches the real hostControl and returns a suspensionID", async () => {
    let captured = null;
    await env.context.modal("test", async function (executionContext) {
      captured = await env.context.suspendHistorySuspension(executionContext, "Photoneshop");
    });
    expect(env.hostControlCalls.suspendHistory).toEqual([{ documentID: 42, name: "Photoneshop" }]);
    expect(captured).toEqual({ documentID: 42, name: "Photoneshop" });
  });

  it("suspendHistorySuspension returns null (never throws) if hostControl.suspendHistory itself throws", async () => {
    env.setSuspendHistoryImpl(async () => {
      throw new Error("older host, unsupported");
    });
    let captured = "not set";
    await env.context.modal("test", async function (executionContext) {
      captured = await env.context.suspendHistorySuspension(executionContext, "Photoneshop");
    });
    expect(captured).toBeNull();
  });

  it("resumeHistorySuspension is a true no-op when given a null suspensionID (never calls executeAsModal)", async () => {
    let calls = 0;
    env.fakePhotoshop.core.executeAsModal = async (fn) => {
      calls++;
      return fn({ hostControl: { resumeHistory: async () => {} } });
    };
    await env.context.resumeHistorySuspension(null, "Apply Threshold");
    expect(calls).toBe(0);
    expect(env.hostControlCalls.resumeHistory.length).toBe(0);
  });

  it("resumeHistorySuspension sets finalName on the suspensionID and calls hostControl.resumeHistory with it", async () => {
    const suspensionID = { documentID: 42, name: "Photoneshop" };
    await env.context.resumeHistorySuspension(suspensionID, "Apply Threshold");
    expect(suspensionID.finalName).toBe("Apply Threshold");
    expect(env.hostControlCalls.resumeHistory).toEqual([suspensionID]);
  });

  it("resumeHistorySuspension without a finalName leaves the suspensionID's name untouched", async () => {
    const suspensionID = { documentID: 42, name: "Photoneshop" };
    await env.context.resumeHistorySuspension(suspensionID);
    expect(suspensionID.finalName).toBeUndefined();
    expect(env.hostControlCalls.resumeHistory).toEqual([suspensionID]);
  });

  it("resumeHistorySuspension never throws even if hostControl.resumeHistory itself throws (best-effort)", async () => {
    env.setResumeHistoryImpl(async () => {
      throw new Error("boom");
    });
    await expect(env.context.resumeHistorySuspension({ documentID: 42 }, "Apply Threshold")).resolves.toBeUndefined();
  });
});

// historyActionName() (core/preview.js) — pure, DOM/PS-free once val/num/chk/
// getDTMode are stubbed. Loads the REAL core/preview.js source; only the
// bare globals historyActionName()/effectGroupName() actually read at call
// time need stubs (every other cross-file dependency in preview.js lives
// inside functions this test never calls, so it never needs to resolve).
function buildPreviewNamingSandbox() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    val: () => "",
    num: () => 0,
    chk: () => false,
    getDTMode: () => "dtg",
    Math,
    Object,
    Error,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("core/preview.js"), context, { filename: path.join(ROOT, "core/preview.js") });
  return { context, sandbox };
}

// _currentTab is a top-level `let` in core/preview.js — like EDIT_PANES/
// SLIDER_DEFAULTS elsewhere in this codebase, that lives in the vm's shared
// lexical scope, not as a `context` object property, so it can only be
// mutated by running another statement in the SAME context (see
// core/init-guard.js's comment on this exact vm behaviour).
function setCurrentTab(context, n) {
  vm.runInContext("_currentTab = " + n + ";", context);
}

describe("core/preview.js — historyActionName() (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildPreviewNamingSandbox();
    setCurrentTab(env.context, 2);
  });

  it('Design Studio, only threshold changed -> "Apply Threshold"', () => {
    env.sandbox.val = (id) => (id === "thresh" ? "90" : id === "effect" ? "none" : "");
    env.sandbox.num = () => 0;
    expect(env.context.historyActionName()).toBe("Apply Threshold");
  });

  it('Design Studio, only tone sliders changed -> "Apply Tone Adjustment"', () => {
    env.sandbox.val = (id) => (id === "thresh" ? "128" : id === "effect" ? "none" : "");
    env.sandbox.num = (id) => (id === "exposure" ? 10 : 0);
    expect(env.context.historyActionName()).toBe("Apply Tone Adjustment");
  });

  it('Design Studio, only vintage sliders changed -> "Apply Vintage Effect"', () => {
    env.sandbox.val = (id) => (id === "thresh" ? "128" : id === "effect" ? "none" : "");
    env.sandbox.num = (id) => (id === "grain" ? 20 : 0);
    expect(env.context.historyActionName()).toBe("Apply Vintage Effect");
  });

  it('Halftone tab (3) -> "Generate Halftone"', () => {
    setCurrentTab(env.context, 3);
    expect(env.context.historyActionName()).toBe("Generate Halftone");
  });

  it('White Ink tab (6) -> "Generate White Underbase"', () => {
    setCurrentTab(env.context, 6);
    expect(env.context.historyActionName()).toBe("Generate White Underbase");
  });

  it('DT Studio, only Ink slider active -> "Ink Reduction"', () => {
    setCurrentTab(env.context, 9);
    env.sandbox.getDTMode = () => "dtg";
    env.sandbox.num = (id) => (id === "dtgInk" ? 15 : 0);
    expect(env.context.historyActionName()).toBe("Ink Reduction");
  });

  it("DT Studio, ink + another slider active -> generic Optimisation, not Ink Reduction", () => {
    setCurrentTab(env.context, 9);
    env.sandbox.getDTMode = () => "dtg";
    env.sandbox.num = (id) => (id === "dtgInk" ? 15 : id === "dtgWhite" ? 10 : 0);
    expect(env.context.historyActionName()).toBe("DTG Optimisation");
  });

  it("DT Studio (DTF mode) with halftone screen on -> appends + Halftone", () => {
    setCurrentTab(env.context, 9);
    env.sandbox.getDTMode = () => "dtf";
    env.sandbox.num = (id) => (id === "dtfCol" ? 10 : 0);
    env.sandbox.chk = (id) => id === "dtHalftone";
    expect(env.context.historyActionName()).toBe("DTF Optimisation + Halftone");
  });
});
