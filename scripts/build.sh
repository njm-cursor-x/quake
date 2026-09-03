#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/opt/python@3.14/bin:/opt/homebrew/opt/python@3.13/bin:/opt/homebrew/opt/python@3.12/bin:${PATH:-}"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found. Install Emscripten (e.g. brew install emscripten)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. It is needed to extract shareware assets." >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake not found. It is needed to build GL4ES." >&2
  exit 1
fi

"$ROOT/scripts/fetch-quake-shareware.sh"
node "$ROOT/scripts/extract-shareware.js"

# Build GL4ES static lib for Emscripten once.
GL4ES_LIB="$ROOT/third_party/gl4es/lib/libGL.a"
if [[ ! -f "$GL4ES_LIB" ]]; then
  echo "Building GL4ES for Emscripten..."
  mkdir -p "$ROOT/build/gl4es"
  (
    cd "$ROOT/build/gl4es"
    emcmake cmake "$ROOT/third_party/gl4es" \
      -DCMAKE_BUILD_TYPE=Release \
      -DNOX11=ON \
      -DNOEGL=ON \
      -DSTATICLIB=ON
    emmake make -j"$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
    mkdir -p "$ROOT/third_party/gl4es/lib"
    # cmake puts the archive in build/gl4es or lib/
    if [[ -f lib/libGL.a ]]; then
      cp lib/libGL.a "$GL4ES_LIB"
    elif [[ -f libGL.a ]]; then
      cp libGL.a "$GL4ES_LIB"
    else
      find . -name 'libGL.a' -exec cp {} "$GL4ES_LIB" \;
    fi
  )
  [[ -f "$GL4ES_LIB" ]] || { echo "GL4ES libGL.a not found after build." >&2; exit 1; }
  echo "GL4ES ready -> $GL4ES_LIB"
fi

make -C "$ROOT" package
echo "Built. Serve with: python3 -m http.server --directory dist 8000"
