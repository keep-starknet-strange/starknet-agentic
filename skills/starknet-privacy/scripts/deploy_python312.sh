#!/bin/bash
# Deploy Privacy Pool with Python 3.12

# Get directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PYTHONPATH="${SCRIPT_DIR}/../.local/lib/python3.12/site-packages:$PYTHONPATH"
export STARKNET_RPC_URL="${STARKNET_RPC_URL:-https://rpc.starknet.testnet.lava.build}"

cd "$SCRIPT_DIR"

echo "🚀 Privacy Pool Deployment (Python 3.12)"
echo "RPC: $STARKNET_RPC_URL"
echo ""

/usr/bin/python3.12 scripts/deploy.py
