/**
 * core/events.js — native Photoshop event listeners
 *
 * A handful of the panel's own UI readouts — the footer's live ink-coverage
 * %, Print Doctor's fix-button availability, the RGB/CMYK toggle — used to
 * refresh only reactively, right after a user-driven plugin action (a slider
 * drag, an Apply click, Convert to RGB/CMYK). Nothing kept them in sync with
 * changes Photoshop itself makes: switching the active document, running
 * Undo/Redo from Photoshop's own History panel, or editing a selection/
 * layer/channel directly with a Photoshop tool. Subscribing to Photoshop's
 * own notification events keeps them live without polling anything.
 *
 * Event set: "select" (fires for an active-document switch, a layer
 * selection change, a channel selection change, and a pixel-selection
 * change — Photoshop uses one event for all four, distinguished by the
 * target reference; we don't need to inspect that, since every refresh
 * below is cheap and idempotent regardless of which sub-case fired),
 * "historyStateChanged" (any undo/redo/new History-panel state — covers
 * layer/selection/channel edits that don't themselves change what's
 * selected), and "open"/"close" for document lifecycle. These four are
 * long-established Action Manager event names used the same way by many
 * published UXP plugins; not verified against a live Photoshop/UXP host in
 * this environment (see README "Status (honest)").
 */

let _psEventsRegistered = false;
let _lastActiveDocId; // undefined = not yet observed; distinct from null (no doc open)

async function handlePhotoshopNotification() {
  try {
    const doc = hasDoc() ? window.app.activeDocument : null;
    const docId = doc ? doc.id : null;
    if (docId !== _lastActiveDocId) {
      _lastActiveDocId = docId;
      // A live-preview session's snapshot layers belong to the document it was
      // started against. If the active document changed (e.g. the user clicked
      // a different open document tab in Photoshop) while a session was live,
      // tear it down immediately — cancelPreview() is already a no-op unless a
      // session is active — rather than let it surface as a "Preview error"
      // the next time a slider on the new tab gets touched.
      if (_previewActive || _sourceReady) await cancelPreview(); // core/preview.js
    }
    updateFixAvailability(); // ai/analysis.js
    updateColourModeToggle(); // ai/analysis.js
    updateCoverage(); // core/history.js
  } catch (e) {
    /* best-effort UI sync — never let a notification handler break the panel */
  }
}

// Registers the listener exactly once per panel session. Safe to call more
// than once (e.g. a defensive call from init()); the guard flag prevents a
// second addNotificationListener registration, which would otherwise fire
// handlePhotoshopNotification twice per event.
function initPhotoshopEventListeners() {
  if (_psEventsRegistered) return;
  try {
    window.action.addNotificationListener(
      ["select", "historyStateChanged", "open", "close"],
      handlePhotoshopNotification
    );
    _psEventsRegistered = true;
  } catch (e) {
    /* unexpected host: panel still works, just without live PS-state sync */
  }
}
