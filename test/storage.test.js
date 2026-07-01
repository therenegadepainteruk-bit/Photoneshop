import { describe, it, expect, beforeEach } from "vitest";
import vm from "node:vm";
import path from "node:path";
import { ROOT, readRepoFile } from "./helpers/vm-loader.js";

// A minimal real localStorage implementation (Map-backed) — good enough to
// exercise the REAL core/storage.js get/set/JSON round-trip logic without
// needing a browser.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
}

function buildStorageSandbox() {
  const localStorage = makeFakeLocalStorage();
  const persistentTokens = new Map(); // token string -> fake folder Entry
  let nextTokenId = 1;
  const fakeFs = {
    createPersistentToken: async (entry) => {
      const token = "token-" + nextTokenId++;
      persistentTokens.set(token, entry);
      return token;
    },
    getEntryForPersistentToken: async (token) => {
      if (!persistentTokens.has(token)) throw new Error("stale token");
      return persistentTokens.get(token);
    },
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    window: { localStorage: localStorage, fs: fakeFs },
    JSON,
    Object,
    Error,
    String,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("core/storage.js"), context, { filename: path.join(ROOT, "core/storage.js") });
  return { context, sandbox, localStorage, fakeFs, persistentTokens };
}

describe("core/storage.js — getUiState()/setUiState() (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildStorageSandbox();
  });

  it("getUiState returns the fallback when nothing was ever saved", () => {
    expect(env.context.getUiState("lastTab", "fallback")).toBe("fallback");
  });

  it("setUiState then getUiState round-trips the real value", () => {
    env.context.setUiState("lastTab", 3);
    expect(env.context.getUiState("lastTab", null)).toBe(3);
  });

  it("setUiState merges into the existing blob instead of replacing it (a second key doesn't erase the first)", () => {
    env.context.setUiState("lastTab", 3);
    env.context.setUiState("layerTarget", "active");
    expect(env.context.getUiState("lastTab", null)).toBe(3);
    expect(env.context.getUiState("layerTarget", null)).toBe("active");
  });

  it("uses a single localStorage key for the whole blob, not one key per field", () => {
    env.context.setUiState("lastTab", 3);
    env.context.setUiState("layerTarget", "active");
    expect(env.localStorage._store.size).toBe(1);
  });

  it("getUiState never throws and falls back to defaults when localStorage.getItem itself throws", () => {
    env.sandbox.window.localStorage.getItem = () => {
      throw new Error("disabled");
    };
    expect(env.context.getUiState("lastTab", "fallback")).toBe("fallback");
  });

  it("getUiState falls back to defaults on corrupt JSON already stored under the key", () => {
    env.localStorage.setItem("photoneshop.uiState", "{not valid json");
    expect(env.context.getUiState("lastTab", "fallback")).toBe("fallback");
  });

  it("setUiState never throws even if localStorage.setItem itself throws", () => {
    env.sandbox.window.localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() => env.context.setUiState("lastTab", 3)).not.toThrow();
  });
});

describe("core/storage.js — rememberFolder()/getRecentFolder() (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildStorageSandbox();
  });

  it("getRecentFolder returns null when nothing was ever remembered for this kind", async () => {
    expect(await env.context.getRecentFolder("screen")).toBeNull();
  });

  it("rememberFolder then getRecentFolder resolves back to the SAME folder entry", async () => {
    const fakeFolder = { name: "Exports" };
    await env.context.rememberFolder("screen", fakeFolder);
    const resolved = await env.context.getRecentFolder("screen");
    expect(resolved).toBe(fakeFolder);
  });

  it("different kinds are remembered independently", async () => {
    const screenFolder = { name: "Screens" };
    const dtgFolder = { name: "DTG" };
    await env.context.rememberFolder("screen", screenFolder);
    await env.context.rememberFolder("dtg", dtgFolder);
    expect(await env.context.getRecentFolder("screen")).toBe(screenFolder);
    expect(await env.context.getRecentFolder("dtg")).toBe(dtgFolder);
  });

  it("getRecentFolder returns null (never throws) when the stored token no longer resolves (folder moved/deleted)", async () => {
    await env.context.rememberFolder("screen", { name: "Exports" });
    env.persistentTokens.clear(); // simulate a stale/invalid token
    expect(await env.context.getRecentFolder("screen")).toBeNull();
  });

  it("rememberFolder never throws even if createPersistentToken itself throws", async () => {
    env.fakeFs.createPersistentToken = async () => {
      throw new Error("permission revoked");
    };
    await expect(env.context.rememberFolder("screen", { name: "x" })).resolves.toBeUndefined();
    expect(await env.context.getRecentFolder("screen")).toBeNull();
  });
});

// engines/print.js resolveExportFolder() — loaded standalone with minimal
// stubs for the handful of bare globals it actually reads (fs,
// getRecentFolder, rememberFolder); every other cross-file dependency in
// engines/print.js lives inside functions this test never calls.
function buildResolveExportFolderSandbox() {
  const calls = { getFolder: 0, rememberFolder: [] };
  const remembered = {};
  let pickerResult = { name: "picked-folder" };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    fs: {
      getFolder: async () => {
        calls.getFolder++;
        return pickerResult;
      },
    },
    getRecentFolder: async (kind) => (kind in remembered ? remembered[kind] : null),
    rememberFolder: async (kind, folder) => {
      calls.rememberFolder.push(kind);
      remembered[kind] = folder;
    },
    Object,
    Error,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(readRepoFile("engines/print.js"), context, { filename: path.join(ROOT, "engines/print.js") });
  return {
    context,
    calls,
    remembered,
    setPickerResult: (v) => {
      pickerResult = v;
    },
  };
}

describe("engines/print.js — resolveExportFolder() (real, isolated vm)", () => {
  let env;

  beforeEach(() => {
    env = buildResolveExportFolderSandbox();
  });

  it("no remembered folder yet: prompts via fs.getFolder() and remembers the choice", async () => {
    const folder = await env.context.resolveExportFolder("screen");
    expect(folder).toEqual({ name: "picked-folder" });
    expect(env.calls.getFolder).toBe(1);
    expect(env.calls.rememberFolder).toEqual(["screen"]);
  });

  it("a remembered folder exists: reuses it directly, WITHOUT prompting again", async () => {
    env.remembered.dtg = { name: "already-remembered" };
    const folder = await env.context.resolveExportFolder("dtg");
    expect(folder).toEqual({ name: "already-remembered" });
    expect(env.calls.getFolder).toBe(0);
  });

  it("user cancels the picker (no remembered folder yet): returns null, never remembers a cancel", async () => {
    env.setPickerResult(null);
    const folder = await env.context.resolveExportFolder("dtf");
    expect(folder).toBeNull();
    expect(env.calls.rememberFolder).toEqual([]);
  });

  it("each export kind is resolved independently", async () => {
    env.remembered.screen = { name: "screens-folder" };
    const folder = await env.context.resolveExportFolder("spots");
    expect(env.calls.getFolder).toBe(1); // "spots" had nothing remembered
    expect(folder).toEqual({ name: "picked-folder" });
  });
});
