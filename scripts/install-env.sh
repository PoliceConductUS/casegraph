#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$repo_root/scripts/install-runtime.sh"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "/usr/local/opt/nvm/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "/usr/local/opt/nvm/nvm.sh"
fi

nvm use "$(tr -d '[:space:]' < "$repo_root/.nvmrc")"

cd "$repo_root"
npm install
npm run install:external
