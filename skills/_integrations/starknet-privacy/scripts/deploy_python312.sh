#!/bin/bash
# Deploy Privacy Pool with Python 3.12

export PYTHONPATH="/home/wner/.local/lib/python3.12/site-packages:$PYTHONPATH"
export STARKNET_RPC_URL="${STARKNET_RPC_URL:-https://rpc.starknet.testnet.lava.build}"

cd /home/wner/clawd/skills/_integrations/starknet-privacy

echo "🚀 Privacy Pool Deployment (Python 3.12)"
echo "RPC: $STARKNET_RPC_URL"
echo ""

/usr/bin/python3.12 scripts/deploy.py
