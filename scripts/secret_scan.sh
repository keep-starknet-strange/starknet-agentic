#!/usr/bin/env bash
set -euo pipefail

# Lightweight local secret scan, aligned with CI.
# Usage:
#   ./scripts/secret_scan.sh
#
# Notes:
# - Scans the working tree (not git history).
# - Redacts detected secrets in output.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.0}"
GITLEAKS_BIN="${GITLEAKS_BIN:-$ROOT_DIR/.cache/gitleaks/${GITLEAKS_VERSION}/gitleaks}"

if [[ ! -x "$GITLEAKS_BIN" ]]; then
  mkdir -p "$(dirname "$GITLEAKS_BIN")"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 2 ;;
  esac

  if [[ "$os" == "darwin" ]]; then
    tarball="gitleaks_${GITLEAKS_VERSION}_darwin_${arch}.tar.gz"
  elif [[ "$os" == "linux" ]]; then
    tarball="gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz"
  else
    echo "Unsupported OS: $os" >&2
    exit 2
  fi

  url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarball}"
  curl -sSL "$url" -o "$tmpdir/gitleaks.tar.gz"
  tar -xzf "$tmpdir/gitleaks.tar.gz" -C "$tmpdir" gitleaks
  install -m 0755 "$tmpdir/gitleaks" "$GITLEAKS_BIN"
fi

"$GITLEAKS_BIN" detect --source . --no-git --redact --exit-code 1 --config "$ROOT_DIR/.gitleaks.toml"
