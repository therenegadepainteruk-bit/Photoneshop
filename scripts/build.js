/**
 * Packages the plugin's shipped files into dist/photoneshop.zip.
 *
 * Photoneshop has no bundler — it's loaded directly by UXP as plain
 * <script>-tag files (see index.html, ARCHITECTURE.md) and is normally
 * installed by sideloading this folder's manifest.json via the UXP
 * Developer Tool (see README "Install"). This "build" only collects the
 * exact files Photoshop needs at runtime into a single zip, for CI package
 * size tracking and for anyone who wants a single artifact to hand off —
 * it does not transform, minify, or bundle any source.
 */
const fs = require("fs");
const path = require("path");
const { ZipArchive } = require("archiver");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "photoneshop.zip");

// Exactly what index.html's <script> tags and manifest.json reference —
// no test/, coverage/, node_modules/, or docs.
const ENTRIES = ["manifest.json", "index.html", "icons", "core", "engines", "ai", "presets", "ui"];

function addEntry(archive, entry) {
  const full = path.join(ROOT, entry);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) archive.directory(full, entry);
  else archive.file(full, { name: entry });
}

async function build() {
  for (const entry of ENTRIES) {
    if (!fs.existsSync(path.join(ROOT, entry))) {
      throw new Error(`build: expected shipped path missing: ${entry}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(OUT_FILE)) fs.rmSync(OUT_FILE);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(OUT_FILE);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const entry of ENTRIES) addEntry(archive, entry);
    archive.finalize();
  });

  const { size } = fs.statSync(OUT_FILE);
  console.log(`Built ${path.relative(ROOT, OUT_FILE)} (${(size / 1024).toFixed(1)} KB)`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
