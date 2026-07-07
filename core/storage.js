/**
 * core/storage.js — native persistent storage for UI state, preferences, and
 * recent folders.
 *
 * Presets (presets/index.js) already use the correct native File System API
 * for their larger, structured data — window.fs.getDataFolder() (UXP's
 * per-plugin persistent data folder) plus a JSON file — and that is left
 * completely untouched here, so existing presets.json files keep loading
 * exactly as before (backwards compatible by construction: nothing about
 * that format or location changed).
 *
 * What was missing was persistence for the small, scalar bits of UI state
 * that used to reset to hard-coded defaults on every panel reload (last
 * active tab, layer target, DT Studio mode, preset category filter), and
 * "recent folder" memory for the four export actions (each re-prompted via
 * the folder picker on every single click, with no memory of the last
 * destination). Both now use genuinely native UXP mechanisms:
 *
 * - window.localStorage — UXP panels support the standard browser
 *   localStorage API for small persistent key/value data (this is NOT the
 *   same restriction as UXP's WebView-hosted content, which cannot use it —
 *   a panel's own HTML is not loaded inside a WebView).
 * - window.fs.createPersistentToken()/getEntryForPersistentToken() (UXP's
 *   localFileSystem, already exposed as window.fs — see core/api.js) — the
 *   documented mechanism for remembering a folder across plugin reloads
 *   without re-prompting for permission every time.
 */

const UI_STATE_KEY = "photoneshop.uiState";

// Reads the whole small UI-state blob in one go (a single localStorage key,
// not one entry per field). Never throws: a disabled/unavailable
// localStorage, or corrupt JSON from some future format change, just means
// callers fall back to their own defaults — a storage failure must never
// break the UI action that triggered it.
function readUiState() {
  try {
    const raw = window.localStorage.getItem(UI_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function writeUiState(patch) {
  try {
    const current = readUiState();
    window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(Object.assign(current, patch)));
  } catch (e) {
    /* best-effort — never block the caller on a storage failure */
  }
}

// Reads one field with a fallback, so callers never need their own
// undefined-checks.
function getUiState(key, fallback) {
  const v = readUiState()[key];
  return v === undefined ? fallback : v;
}

function setUiState(key, value) {
  writeUiState({ [key]: value });
}

// ---- recent folders (persistent file-system tokens) ----
// `kind` namespaces independent "recent folder" memories per export type
// (e.g. "screen", "dtg", "dtf", "spots") so exporting screens to one folder
// doesn't overwrite the remembered DTG export folder.
async function rememberFolder(kind, folderEntry) {
  try {
    const token = await window.fs.createPersistentToken(folderEntry);
    setUiState("recentFolder_" + kind, token);
  } catch (e) {
    /* best-effort — losing "remember this folder" must never fail the export itself */
  }
}

// Resolves a previously-remembered folder back to a real, usable Entry.
// Returns null if none was ever remembered, or the token can no longer be
// resolved (folder moved/deleted, or permission revoked — the documented,
// expected failure mode for persistent tokens), so callers fall back to
// prompting via fs.getFolder() exactly like before this feature existed.
async function getRecentFolder(kind) {
  const token = getUiState("recentFolder_" + kind, null);
  if (!token) return null;
  try {
    return await window.fs.getEntryForPersistentToken(token);
  } catch (e) {
    return null;
  }
}
