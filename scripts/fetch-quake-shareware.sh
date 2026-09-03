#!/usr/bin/env bash
set -euo pipefail

# Downloads the official Quake 1.06 shareware archive (quake106.zip). The archive
# itself is what id's shareware license permits redistributing electronically;
# a loose pak0.pak may not be. SHA256 is pinned so a mirror swap cannot silently
# substitute different data.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${ROOT}/data/quake106.zip"
# Primary mirror: historic idstuff tree. Override with QUAKE106_URL if needed.
URL="${QUAKE106_URL:-https://ftp.gwdg.de/pub/misc/ftp.idsoftware.com/idstuff/quake/quake106.zip}"
SHA256="ec6c9d34b1ae0252ac0066045b6611a7919c2a0d78a3a66d9387a8f597553239"
SIZE=9094045

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if [[ -f "$ZIP" ]] && [[ "$(sha256_of "$ZIP")" == "$SHA256" ]]; then
  echo "quake106.zip already present and verified."
  exit 0
fi

mkdir -p "${ROOT}/data"
echo "Downloading Quake 1.06 shareware archive..."
curl -L --fail -o "${ZIP}.tmp" "$URL"

ACTUAL="$(sha256_of "${ZIP}.tmp")"
ACTUAL_SIZE="$(wc -c < "${ZIP}.tmp" | tr -d ' ')"
if [[ "$ACTUAL" != "$SHA256" || "$ACTUAL_SIZE" != "$SIZE" ]]; then
  rm -f "${ZIP}.tmp"
  echo "Checksum mismatch (got ${ACTUAL}, ${ACTUAL_SIZE} bytes)." >&2
  echo "Expected ${SHA256}, ${SIZE} bytes." >&2
  echo "Refusing to use an unverified archive." >&2
  exit 1
fi

mv "${ZIP}.tmp" "$ZIP"
echo "Verified authentic Quake 1.06 shareware archive -> data/quake106.zip"
