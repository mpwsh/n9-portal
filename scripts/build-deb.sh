#!/bin/bash
# Build the n9-mirror-setup.deb package into public/.
#
# The N9's GUI package installer requires Maemo metadata to render the
# install screen (display name, flags, icon, armel arch). Without these,
# it rejects the package as "invalid installation package."
#
# Force gzip compression because the N9's 2012-era dpkg predates zstd.

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
ICON_PNG="${SCRIPT_DIR}/icon.png"

if [ ! -f "$ICON_PNG" ]; then
  echo "ERROR: icon not found at $ICON_PNG" >&2
  exit 1
fi

BUILD_DIR="$(mktemp -d)"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/etc/apt/sources.list.d"

# Sources list. http:// for compatibility with the stock N9 apt/curl
# (modern TLS only works after installing the OpenSSL 1.0.2u package).
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

# Maemo-Icon-26 is base64 with each line indented by one space (debian
# control-file continuation format).
ICON_B64="$(base64 -w 76 "$ICON_PNG" | sed 's/^/ /')"

cat >"$PKG_DIR/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${PKG_VERSION}
Architecture: armel
Maintainer: ${MAINTAINER}
Section: user/other
Priority: optional
Homepage: ${HOMEPAGE}
Description: ${DESCRIPTION}
Maemo-Display-Name: ${DISPLAY_NAME}
Maemo-Flags: visible
Maemo-Icon-26:
${ICON_B64}
EOF

# Post-install: blank out the dead Nokia offline SSU keyring repo lists so
# `apt-get update` doesn't spew errors. Files must exist (not be deleted) so
# aegis-ssu doesn't try to recreate them.
cat >"$PKG_DIR/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
for f in /etc/apt/sources.list.d/aegis.ssu-keyring-*.list; do
    [ -e "$f" ] && : > "$f"
done
exit 0
EOF
chmod 0755 "$PKG_DIR/DEBIAN/postinst"

mkdir -p "$OUT_DIR"
dpkg-deb --build --root-owner-group -Zgzip "$PKG_DIR" "${OUT_DIR}/${SHORT_PKG_NAME}.deb" >/dev/null

rm -rf "$BUILD_DIR"

echo "Built: ${OUT_DIR}/${SHORT_PKG_NAME}.deb"
ls -lh "${OUT_DIR}/${SHORT_PKG_NAME}.deb"
