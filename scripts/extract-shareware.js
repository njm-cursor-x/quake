#!/usr/bin/env node
// Extract id1/pak0.pak from the official quake106.zip for local builds.
// Mirrors the browser extraction path in web/app.js (zip → resource.1 → LHA → pak).
// Never packages the loose pak into dist/ — only the zip is shippable.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ZIP = path.join(ROOT, "data", "quake106.zip");
const OUT = path.join(ROOT, "data", "id1", "pak0.pak");
const PAK_SHA256 =
  "35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af";
const PAK_SIZE = 18689235;

function sha256Hex(buf) {
  return require("crypto").createHash("sha256").update(buf).digest("hex");
}

function loadLha() {
  const code = fs.readFileSync(path.join(ROOT, "web/vendor/lha.js"), "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.LHA;
}

function findLhaStart(data) {
  for (let i = 0; i < Math.min(data.length - 7, 8192); i++) {
    if (
      data[i + 2] === 0x2d &&
      data[i + 3] === 0x6c &&
      data[i + 4] === 0x68 &&
      data[i + 6] === 0x2d
    ) {
      return i;
    }
  }
  throw new Error("No LHA header found in resource.1");
}

function unzipEntry(zipPath, entryName) {
  // Prefer system unzip for a single entry; avoids a zip dependency at build time.
  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "quake-zip-"));
  try {
    execFileSync("unzip", ["-o", "-j", zipPath, entryName, "-d", tmpDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = path.join(tmpDir, path.basename(entryName));
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(ZIP)) {
    console.error("Missing data/quake106.zip — run scripts/fetch-quake-shareware.sh first.");
    process.exit(1);
  }

  if (fs.existsSync(OUT)) {
    const existing = fs.readFileSync(OUT);
    if (existing.length === PAK_SIZE && sha256Hex(existing) === PAK_SHA256) {
      console.log("data/id1/pak0.pak already present and verified.");
      return;
    }
  }

  console.log("Extracting resource.1 from quake106.zip...");
  const resource = unzipEntry(ZIP, "resource.1");
  const LHA = loadLha();
  const start = findLhaStart(resource);
  const entries = LHA.read(resource.subarray(start));
  const pakEntry = entries.find((e) => /pak0\.pak$/i.test(e.name.replace(/\\/g, "/")));
  if (!pakEntry) {
    console.error("PAK0.PAK not found in resource.1");
    process.exit(1);
  }

  console.log(`Unpacking ${pakEntry.name} (${pakEntry.length} bytes)...`);
  const pak = LHA.unpack(pakEntry);
  if (pak.length !== PAK_SIZE || sha256Hex(Buffer.from(pak)) !== PAK_SHA256) {
    console.error("Extracted pak0.pak failed checksum verification.");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, pak);
  console.log(`Verified shareware pak0.pak -> ${path.relative(ROOT, OUT)}`);
}

main();
