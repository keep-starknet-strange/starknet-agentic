#!/bin/bash
cd /tmp
if [ ! -d repo ]; then
  git clone https://github.com/keep-starknet-strange/starknet-agentic repo
fi
cd repo
echo "=== TOP LEVEL ==="
ls -la
echo "=== CONTRACTS ==="
ls -la contracts/
echo "=== CONTRACTS DEEP ==="
find contracts/ -type f | sort
echo "=== SCRATCHPAD ==="
ls -la scratchpad/ 2>/dev/null || echo "no scratchpad"
echo "=== PACKAGES ==="
ls -la packages/ 2>/dev/null || echo "no packages"
echo "=== CAIRO ==="
find . -name "*.cairo" | sort | head -60
echo "=== TOML FILES ==="
find . -name "Scarb.toml" -o -name "pyproject.toml" -o -name "Cargo.toml" | sort
echo "=== README ==="
head -80 README.md
