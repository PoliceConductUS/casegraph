#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="$(tr -d '[:space:]' < "$repo_root/.nvmrc")"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install runtime tools."
  echo "Install Homebrew, then run: npm run install:runtime"
  exit 1
fi

brew bundle --file "$repo_root/Brewfile"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
mkdir -p "$NVM_DIR"

if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "/usr/local/opt/nvm/nvm.sh"
else
  echo "nvm was installed, but nvm.sh was not found in a Homebrew prefix."
  echo "Open a new shell or follow the Homebrew nvm setup output, then run: nvm install"
  exit 1
fi

nvm install "$node_version"
nvm use "$node_version"

echo "Runtime ready: node $(node --version), npm $(npm --version)"
