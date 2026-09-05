#!/usr/bin/env bash
# Provision the md2nativedocx dev environment.
#
# Installs the runtime dependencies that do NOT ship in a default Codespaces
# image: Pandoc, a Lua interpreter, and LibreOffice (needed headless for the
# visual-regression tests, spec §9).
#
# Versions here MUST stay in sync with .github/workflows/ci.yml. Drift between
# "works in my Codespace" and "fails in CI" wastes everyone's time.
#
# NOTE: This file is part of .devcontainer/ — any change here requires explicit
# human review (see AGENTS.md → Codespaces). Do not modify it as an incidental
# part of an unrelated task.
set -euo pipefail

PANDOC_VERSION="3.1.3"
LUA_VERSION="5.4"
DOTNET_SDK_VERSION="10.0.200"

echo "==> Installing Pandoc ${PANDOC_VERSION}"
if ! command -v pandoc >/dev/null 2>&1 || ! pandoc --version | grep -q "${PANDOC_VERSION}"; then
  # Pandoc ships as a standalone binary tarball from GitHub releases.
  curl -fsSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz" \
    -o /tmp/pandoc.tar.gz
  tar -xzf /tmp/pandoc.tar.gz -C /tmp
  sudo cp "/tmp/pandoc-${PANDOC_VERSION}/bin/pandoc" /usr/local/bin/pandoc
  rm -rf /tmp/pandoc.tar.gz "/tmp/pandoc-${PANDOC_VERSION}"
fi
pandoc --version | head -1

echo "==> Installing Lua ${LUA_VERSION}"
if ! command -v lua5.4 >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq "lua${LUA_VERSION}"
fi
lua5.4 -v

echo "==> Installing LibreOffice (headless, for visual-regression tests)"
# NOTE (limitation documentée): LibreOffice n'est PAS version-pinné ici, contrairement
# à Pandoc et Lua. Raison : l'image devcontainer est Debian bookworm
# (typescript-node:1-22-bookworm), et la version de LibreOffice disponible dépend du
# repo apt de cette image — un pinning apt exact (ex. libreoffice-writer=4:24.2.7-...)
# serait fragile et casserait si le repo change. Le pinning de Pandoc fonctionne car
# Pandoc est téléchargé en tarball binaire depuis les GitHub releases (version exacte,
# indépendante de l'OS). Pour LibreOffice, on accepte la version du repo apt.
# Suivi : voir TODO.md → "CI/CD & environnement" (tâche de suivi LibreOffice pinning).
if ! command -v libreoffice >/dev/null 2>&1 && ! command -v soffice >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq libreoffice-writer libreoffice-impress
fi
libreoffice --version 2>/dev/null || soffice --version 2>/dev/null || echo "LibreOffice not found"

echo "==> Installing .NET SDK ${DOTNET_SDK_VERSION}"
# Optional dependency: only used by scripts/oxml-validator/ (npm run
# test:oxml-validate, AGENTS.md → "Diagnosing 'Word won't open the file'").
# test:oxml-validate degrades gracefully (exit 0) without it, so a failure
# provisioning it here should never block the rest of setup.
# Installed via Microsoft's own dotnet-install.sh, exact version pinned,
# same OS-independent-tarball approach as Pandoc above rather than an apt
# package (whose available version depends on this image's repo, like the
# LibreOffice limitation documented above) -- keeps this in sync with
# actions/setup-dotnet@v4's pinned version in ci.yml.
if ! command -v dotnet >/dev/null 2>&1 || ! dotnet --list-sdks | grep -q "^${DOTNET_SDK_VERSION} "; then
  curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --version "${DOTNET_SDK_VERSION}" --install-dir /usr/local/share/dotnet
  sudo ln -sf /usr/local/share/dotnet/dotnet /usr/local/bin/dotnet
  rm -f /tmp/dotnet-install.sh
fi
dotnet --version

echo "==> Installing npm workspace dependencies"
npm install

echo "==> Dev environment ready."
