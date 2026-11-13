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

VERSION="26.2.6"
SERIES="26.2"
SHA256="fd0e8f8f2408dd2e5b90286e60f3f97cf566ba441cd48cfc5bcc68067303e0bc"

TARGET="/opt/libreoffice${SERIES}"
LAUNCHER="/usr/local/bin/soffice-${SERIES}"

if [ -x "${TARGET}/program/soffice" ] && "${TARGET}/program/soffice" --version | grep -q "LibreOffice ${VERSION}"; then
  "${TARGET}/program/soffice" --version
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

tarball="LibreOffice_${VERSION}_Linux_x86-64_deb.tar.gz"
curl -fsSL "https://download.documentfoundation.org/libreoffice/stable/${VERSION}/deb/x86_64/${tarball}" \
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
