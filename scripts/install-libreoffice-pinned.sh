#!/usr/bin/env bash
# Install an exact, pinned LibreOffice release next to the distribution's one.
#
# Why a second LibreOffice: the visual-regression baselines (TESTING.md chapter 4) are rendered by
# the apt LibreOffice and must not move. The ODF target (docs/specs/05-libreoffice-odf-spec.md)
# needs a recent release instead: 26.2 is the first with a Markdown import. The two live side by
# side: the pinned one goes to /opt/libreoffice<series>, with a launcher named soffice-<series>.
#
# Used by .devcontainer/setup.sh and .github/workflows/ci.yml: the pin lives only here, so the two
# cannot drift. Changing it means updating both VERSION and SHA256 (the sha256 of the official
# tarball, after checking its GPG signature against the TDF code-signing key
# C2839ECAD9408FBE9531C3E9F434A1EFAFEEAEA3).
#
# Run after the apt LibreOffice: the official .deb files are only unpacked (dpkg -x), not
# installed, so their shared-library dependencies come from the distribution package.
set -euo pipefail

VERSION="26.2.7"
SERIES="26.2"
# The archive (downloadarchive.documentfoundation.org) names releases with all four numbers.
FULL_VERSION="26.2.7.3"
SHA256="8cd04a88396a9230264ff784ec89cc090cbfd0960c192483ba2b80fa53939416"

TARGET="/opt/libreoffice${SERIES}"
LAUNCHER="/usr/local/bin/soffice-${SERIES}"

if [ -x "${TARGET}/program/soffice" ] && "${TARGET}/program/soffice" --version | grep -q "LibreOffice ${VERSION}"; then
  "${TARGET}/program/soffice" --version
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

tarball="LibreOffice_${VERSION}_Linux_x86-64_deb.tar.gz"
archive_tarball="LibreOffice_${FULL_VERSION}_Linux_x86-64_deb.tar.gz"
# /stable/ only ever holds the current release: once TDF ships the next one, the pinned version
# moves to the archive. Try both, so the pin keeps working (the SHA-256 below is what is trusted).
curl -fsSL --retry 3 --retry-delay 5 \
  "https://download.documentfoundation.org/libreoffice/stable/${VERSION}/deb/x86_64/${tarball}" \
  -o "${work}/${tarball}" ||
  curl -fsSL --retry 3 --retry-delay 5 \
    "https://downloadarchive.documentfoundation.org/libreoffice/old/${FULL_VERSION}/deb/x86_64/${archive_tarball}" \
    -o "${work}/${tarball}"
echo "${SHA256}  ${work}/${tarball}" | sha256sum -c -

mkdir -p "${work}/x" "${work}/root"
tar -xzf "${work}/${tarball}" -C "${work}/x"
for deb in "${work}"/x/*/DEBS/*.deb; do
  dpkg -x "${deb}" "${work}/root"
done

sudo rm -rf "${TARGET}"
sudo mv "${work}/root/opt/libreoffice${SERIES}" "${TARGET}"
sudo ln -sf "${TARGET}/program/soffice" "${LAUNCHER}"
"${LAUNCHER}" --version
