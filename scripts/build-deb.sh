#!/bin/bash
# Build the n9-mirror-setup.deb package into public/.
#
# Why this script is shaped this way:
#   The N9's GUI package installer is picky about package metadata
#   (Maemo-Display-Name, Maemo-Flags, Maemo-Icon-26, Architecture: armel).
#   Building from scratch with modern dpkg-deb on a current Linux distro
#   produced packages the device rejected as "invalid installation package."
#
#   Solution: use a known-good upstream control file as a template
#   (n9repomirror by Wunder Wungiel), substitute our fields with sed,
#   and keep the embedded icon + Maemo metadata. Force gzip compression
#   so the ancient on-device dpkg can read the archive.
#
# Requires: scripts/templates/control.template (extracted from a known-good
# upstream n9 .deb — see comments in that file for provenance).

set -euo pipefail

PKG_NAME="n9-mirror-setup"
SHORT_PKG_NAME="setup"
PKG_VERSION="1.0-1"
MAINTAINER="N9 Mirror <admin@mpw.sh>"
HOMEPAGE="https://n9.mpw.sh"
DISPLAY_NAME="N9 Mirror Setup"
DESCRIPTION="Adds the n9.mpw.sh apt repository"

OUT_DIR="public"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/templates/control.template"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: control template not found at $TEMPLATE" >&2
  echo "       This template comes from a known-good upstream N9 .deb." >&2
  exit 1
fi

BUILD_DIR="$(mktemp -d)"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/etc/apt/sources.list.d"

# Sources list dropped into /etc/apt/sources.list.d/
# Note: http:// (not https://) for compatibility with the N9's stock apt/curl,
# which can't do modern TLS until the OpenSSL 1.0.2u package is installed.
cat >"$PKG_DIR/etc/apt/sources.list.d/n9-mirror.list" <<'EOF'
# N9 Mirror — n9.mpw.sh

# Flat repositories
deb http://n9.mpw.sh/n9mirror/001 ./
deb http://n9.mpw.sh/n9mirror/apps ./
deb http://n9.mpw.sh/n9mirror/tools ./

# Standard repository (Harmattan SDK)
# deb http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free non-free
# deb-src http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/sdk free

# Nokia binaries
# deb http://n9.mpw.sh/harmattan-dev.nokia.com/ harmattan/41667a5bd857be02f487c2ce806fbf85 nokia-binaries
EOF

# Build the control file from the template — preserve Maemo-Icon-26 (the long
# base64 PNG embedded in the upstream control file) and Maemo-Flags by only
# rewriting specific top-of-file fields.
sed \
  -e "s|^Package: .*|Package: ${PKG_NAME}|" \
  -e "s|^Version: .*|Version: ${PKG_VERSION}|" \
  -e "s|^Maintainer: .*|Maintainer: ${MAINTAINER}|" \
  -e "s|^Homepage: .*|Homepage: ${HOMEPAGE}|" \
  -e "s|^Description: .*|Description: ${DESCRIPTION}|" \
  -e "s|^Maemo-Display-Name: .*|Maemo-Display-Name: ${DISPLAY_NAME}|" \
  "$TEMPLATE" >"$PKG_DIR/DEBIAN/control"

# Post-install: blank out the dead Nokia offline SSU keyring repo lists so
# `apt-get update` doesn't spew errors about unreachable servers. Files
# must exist (not be deleted) so aegis-ssu doesn't try to recreate them.
cat >"$PKG_DIR/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
for f in /etc/apt/sources.list.d/aegis.ssu-keyring-*.list; do
    [ -e "$f" ] && : > "$f"
done
exit 0
EOF
chmod 0755 "$PKG_DIR/DEBIAN/postinst"

# Force gzip compression: the N9's stock dpkg (from 2012) predates zstd
# and rejects zstd-compressed .debs as "damaged installation package."
mkdir -p "$OUT_DIR"
dpkg-deb --build --root-owner-group -Zgzip "$PKG_DIR" "${OUT_DIR}/${SHORT_PKG_NAME}.deb" >/dev/null

rm -rf "$BUILD_DIR"

echo "Built: ${OUT_DIR}/${SHORT_PKG_NAME}.deb"
ls -lh "${OUT_DIR}/${SHORT_PKG_NAME}.deb"
echo
echo "Verify:"
echo "  dpkg-deb -I ${OUT_DIR}/${SHORT_PKG_NAME}.deb | head -20"
echo "  ar t ${OUT_DIR}/${SHORT_PKG_NAME}.deb   # should show control.tar.gz, data.tar.gz"
