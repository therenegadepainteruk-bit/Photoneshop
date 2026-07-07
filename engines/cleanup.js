/**
 * engines/cleanup.js — Artwork Cleanup
 * All operations stamp a new layer; original untouched.
 */

function bindCleanup(id, cmds, name, msg) {
  bind(id, async () => {
    if (!guard()) return;
    try {
      await runNonDestructive(name, cmds, "CleanupFix");
      setStatus(msg + " — new layer in CleanupFix group", "success");
    } catch (e) {
      setStatus("Error: " + e.message, "error");
    }
  });
}

function initCleanup() {
  bindCleanup("removeStray", [{ _obj: "despeckle" }], "Remove Isolated Pixels", "Isolated pixels removed");

  bindCleanup(
    "removeHalos",
    [
      {
        _obj: "minimum",
        radius: { _unit: "pixelsUnit", _value: 1 },
        preserveShape: { _enum: "preserveShape", _value: "roundness" },
      },
    ],
    "Remove White Halos",
    "White halos removed"
  );

  bindCleanup(
    "removeJpeg",
    [{ _obj: "dustAndScratches", radius: { _unit: "pixelsUnit", _value: 1 }, threshold: 12 }],
    "Fix JPEG Artefacts",
    "JPEG artefacts reduced"
  );

  bindCleanup("fixAI", [{ _obj: "posterization", levels: 12 }, opMedian(1)], "Fix AI Artwork", "AI artwork cleaned");

  bindCleanup("smoothEdges", [opGaussian(0.5)], "Smooth Edges", "Edges smoothed");

  bindCleanup("autoSharpen", [opUnsharp(80, 1, 2)], "Auto Sharpen", "Sharpened");
}
