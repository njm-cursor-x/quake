const CACHE_NAME = "web-quake-v1";
const WASM_URL = "quake.wasm";
const ZIP_URL = "data/quake106.zip";
const PAK_SHA256 =
  "35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af";
const PAK_SIZE = 18689235;

const splash = document.getElementById("splash");
const game = document.getElementById("game");
const canvas = document.getElementById("canvas");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const fillEl = document.getElementById("fill");
const pakFile = document.getElementById("pak-file");
const pakName = document.getElementById("pak-name");
const volumeInput = document.getElementById("volume");
const volumeLabel = document.getElementById("volume-label");

const autoPrefetch = navigator.connection?.saveData !== true;

const tally = new Map();
let engineRequest = null;
let scriptRequest = null;
let zipRequest = null;
let droppedPak = null;
let readinessToken = 0;
let launched = false;

const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1);

function setStatus(text) {
  statusEl.textContent = text;
}

function reportProgress() {
  let received = 0;
  let total = 0;
  let sized = true;

  for (const entry of tally.values()) {
    received += entry.received;
    total += entry.total;
    if (!entry.known) sized = false;
  }

  if (received === 0) return;
  progressEl.hidden = false;

  if (sized && total > 0) {
    fillEl.style.width = `${Math.min(100, Math.round((received / total) * 100))}%`;
    setStatus(`Downloading ${mib(received)} / ${mib(total)} MB`);
  } else {
    setStatus(`Downloading ${mib(received)} MB`);
  }
}

const ENGINE_ASSETS = [WASM_URL];
const BUILD_KEY = "__build";

async function evictStaleEngine(cache) {
  const [current, stored] = await Promise.all([
    fetch("build.txt", { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")),
    cache.match(BUILD_KEY).then((r) => r?.text() ?? ""),
  ]);
  if (current.trim() === stored.trim()) return;
  await Promise.all(ENGINE_ASSETS.map((name) => cache.delete(name)));
  await cache.delete("quake.js");
  await cache.put(BUILD_KEY, new Response(current.trim()));
}

let cacheRequest = null;
function openCache() {
  if (!cacheRequest) {
    cacheRequest =
      typeof caches === "undefined"
        ? Promise.resolve(null)
        : caches
            .open(CACHE_NAME)
            .then(async (cache) => {
              await evictStaleEngine(cache).catch(() => {});
              return cache;
            })
            .catch(() => null);
  }
  return cacheRequest;
}

async function loadAsset(url) {
  const entry = { received: 0, total: 0, known: false };
  tally.set(url, entry);

  const cache = await openCache();
  const hit = await cache?.match(url);
  if (hit) {
    const buffer = await hit.arrayBuffer();
    entry.total = buffer.byteLength;
    entry.received = buffer.byteLength;
    entry.known = true;
    reportProgress();
    return buffer;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }
  entry.total = Number(response.headers.get("content-length")) || 0;
  entry.known = entry.total > 0;

  const reader = response.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    entry.received += value.length;
    entry.total = Math.max(entry.total, entry.received);
    reportProgress();
  }

  const bytes = new Uint8Array(entry.received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  cache
    ?.put(url, new Response(bytes, { headers: { "content-length": String(bytes.length) } }))
    .catch(() => {});

  return bytes.buffer;
}

function loadEngineScript() {
  scriptRequest ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "quake.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load quake.js"));
    document.body.appendChild(script);
  });
  return scriptRequest;
}

function requestEngine() {
  if (!engineRequest) {
    engineRequest = Promise.all([loadEngineScript(), loadAsset(WASM_URL)]).then(
      ([, wasmBinary]) => ({ wasmBinary })
    );
    engineRequest.catch(() => {
      engineRequest = null;
    });
  }
  return engineRequest;
}

function requestZip() {
  zipRequest ??= loadAsset(ZIP_URL).catch((err) => {
    zipRequest = null;
    throw err;
  });
  return zipRequest;
}

function pendingPak() {
  return droppedPak ? droppedPak.buffer : extractPakFromZip(requestZip());
}

function watchReadiness() {
  const token = ++readinessToken;
  Promise.all([requestEngine(), pendingPak()])
    .then(() => {
      if (token !== readinessToken || launched) return;
      progressEl.hidden = false;
      fillEl.style.width = "100%";
      setStatus("Ready.");
    })
    .catch((err) => {
      if (token === readinessToken) setStatus(err.message);
    });
}

volumeInput.addEventListener("input", () => {
  const pct = Number(volumeInput.value);
  volumeLabel.textContent = pct === 0 ? "Muted" : `Volume ${pct}%`;
});

pakFile.addEventListener("change", () => {
  const file = pakFile.files?.[0];
  if (!file) {
    droppedPak = null;
    pakName.hidden = true;
    return;
  }
  droppedPak = {
    name: file.name.replace(/[^A-Za-z0-9._-]/g, "_"),
    buffer: file.arrayBuffer(),
  };
  pakName.hidden = false;
  pakName.textContent = `Using ${file.name} (${mib(file.size)} MB)`;
  if (autoPrefetch) watchReadiness();
});

/** Minimal ZIP reader for stored/deflate entries (quake106.zip uses deflate). */
async function unzipEntry(zipBuffer, entryName) {
  const data = new Uint8Array(zipBuffer);
  const view = new DataView(zipBuffer);
  let offset = 0;
  const nameLower = entryName.toLowerCase();

  while (offset + 30 < data.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(data.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const payload = data.subarray(dataStart, dataStart + compSize);
    offset = dataStart + compSize;

    if (name.toLowerCase() !== nameLower) continue;

    if (method === 0) {
      return payload.slice(0, uncompSize);
    }
    if (method === 8) {
      const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    }
    throw new Error(`Unsupported ZIP method ${method} for ${name}`);
  }
  throw new Error(`${entryName} not found in archive`);
}

function findLhaStart(data) {
  for (let i = 0; i < Math.min(data.length - 7, 8192); i++) {
    if (data[i + 2] === 0x2d && data[i + 3] === 0x6c && data[i + 4] === 0x68 && data[i + 6] === 0x2d) {
      return i;
    }
  }
  throw new Error("No LHA header found in resource.1");
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function extractPakFromZip(zipPromise) {
  const zipBuffer = await zipPromise;
  setStatus("Extracting shareware data…");
  const resource = await unzipEntry(zipBuffer, "resource.1");
  const start = findLhaStart(resource);
  if (typeof LHA === "undefined") {
    throw new Error("lha.js failed to load");
  }
  const entries = LHA.read(resource.subarray(start));
  const pakEntry = entries.find((e) => /pak0\.pak$/i.test(String(e.name).replace(/\\/g, "/")));
  if (!pakEntry) {
    throw new Error("PAK0.PAK not found in shareware archive");
  }
  const pak = LHA.unpack(pakEntry);
  if (pak.length !== PAK_SIZE) {
    throw new Error(`Unexpected pak0.pak size (${pak.length})`);
  }
  const digest = await sha256Hex(pak);
  if (digest !== PAK_SHA256) {
    throw new Error("pak0.pak failed integrity check");
  }
  return pak.buffer;
}

// quake.rc runs default.cfg, then config.cfg, then this. Vanilla's defaults
// move with the arrow keys, leave W/S/D unbound, and put swim up/down on A/Z.
const AUTOEXEC = `bind "w" "+forward"
bind "s" "+back"
bind "a" "+moveleft"
bind "d" "+moveright"
bind "SPACE" "+jump"
lookspring 0
lookstrafe 0
`;

function ensureDir(FS, dir) {
  const parts = dir.split("/").filter(Boolean);
  let path = "";
  for (const part of parts) {
    path += "/" + part;
    try {
      FS.mkdir(path);
    } catch (_) {
      /* exists */
    }
  }
}

startBtn.addEventListener("click", async () => {
  if (launched) return;
  launched = true;
  startBtn.disabled = true;

  try {
    const [{ wasmBinary }, pakData] = await Promise.all([requestEngine(), pendingPak()]);

    setStatus("Starting…");
    splash.hidden = true;
    game.hidden = false;

    const Module = await window.createQuake({
      canvas,
      instantiateWasm: (imports, onSuccess) => {
        WebAssembly.instantiate(wasmBinary, imports).then(
          (result) => onSuccess(result.instance),
          (err) => setStatus(`WebAssembly failed to start: ${err.message}`)
        );
      },
      locateFile: (path) => path,
      print: (text) => console.log(text),
      printErr: (text) => console.error(text),
      captureMouse: () => {
        canvas.requestPointerLock?.();
      },
    });

    ensureDir(Module.FS, "/id1");
    Module.FS.writeFile("/id1/pak0.pak", new Uint8Array(pakData));
    Module.FS.writeFile("/id1/autoexec.cfg", AUTOEXEC);

    canvas.focus();
    canvas.addEventListener("click", () => {
      canvas.requestPointerLock?.();
    });

    // Stuffed cvars run after config.cfg is exec'd, so the splash setting wins
    // over whatever volume a previous session saved to IndexedDB.
    const volume = (Number(volumeInput.value) / 100).toFixed(2);
    Module.callMain([
      "quake",
      "-basedir", "/",
      "-window",
      "-width", "640",
      "-height", "480",
      "+volume", volume,
      "+bgmvolume", volume,
    ]);
  } catch (err) {
    console.error(err);
    launched = false;
    splash.hidden = false;
    game.hidden = true;
    startBtn.disabled = false;
    setStatus(err.message || String(err));
  }
});

if (autoPrefetch) {
  watchReadiness();
} else {
  setStatus("Data Saver is on — the download starts when you press Start.");
}
