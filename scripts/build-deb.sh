#!/bin/bash
# Build the n9-mirror-setup.deb package into public/.
# Astro will then include it in the static asset bundle that wrangler ships.
set -euo pipefail

PKG_NAME="n9-mirror-setup"
PKG_VERSION="1.0-1"
BUILD_DIR="$(mktemp -d)"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}_${PKG_VERSION}"
OUT_DIR="public"

mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/etc/apt/sources.list.d"

# The actual sources.list dropped into /etc/apt/sources.list.d/
cat > "$PKG_DIR/etc/apt/sources.list.d/n9-mirror.list" <<'EOF'
# N9 Mirror — Harmattan packages
# https://n9.mpw.sh

# Flat repositories
deb https://n9.mpw.sh/n9mirror/001 ./
deb https://n9.mpw.sh/n9mirror/apps ./
deb https://n9.mpw.sh/n9mirror/tools ./

# Standard repository (Harmattan SDK)
deb https://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free non-free
deb-src https://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free

# Nokia binaries
deb https://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/41667a5bd857be02f487c2ce806fbf85 nokia-binaries
EOF

cat > "$PKG_DIR/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $PKG_VERSION
Section: utils
Priority: optional
Architecture: all
Maintainer: N9 Mirror <admin@mpw.sh>
Description: Adds the n9.mpw.sh apt repository
 Configures /etc/apt/sources.list.d/n9-mirror.list to enable the
 community mirror of MeeGo Harmattan packages and tools.
EOF

dpkg-deb --build --root-owner-group "$PKG_DIR" >/dev/null

mkdir -p "$OUT_DIR"
mv "${PKG_DIR}.deb" "${OUT_DIR}/${PKG_NAME}.deb"
rm -rf "$BUILD_DIR"

echo "Built: ${OUT_DIR}/${PKG_NAME}.deb"
ls -lh "${OUT_DIR}/${PKG_NAME}.deb"
