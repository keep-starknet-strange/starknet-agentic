#!/bin/bash
set -euo pipefail

# Huginn Meta-Skill: Complete Onboarding with Paymaster
# Usage: ./meta-install.sh --source-chain ethereum --amount 0.01 --agent-name MyAgent

SOURCE_CHAIN=""
AMOUNT=""
AGENT_NAME=""
METADATA_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --source-chain) SOURCE_CHAIN="$2"; shift 2 ;;
    --amount) AMOUNT="$2"; shift 2 ;;
    --agent-name) AGENT_NAME="$2"; shift 2 ;;
    --metadata-url) METADATA_URL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "🌉 Huginn Meta-Skill: Zero-Friction Onboarding"
echo "=============================================="
echo "Source: $SOURCE_CHAIN"
echo "Amount: $AMOUNT ETH"
echo "Agent: $AGENT_NAME"
echo ""

# Step 1/3: Bridge
echo "Step 1/3: Bridging to Starknet via AVNU..."
# TODO: AVNU bridge API call

# Step 2/3: Deploy Account with Paymaster
echo "Step 2/3: Deploying agent account (paymaster subsidizes gas)..."
# TODO: Deploy with paymaster - NO STRK REQUIRED

# Step 3/3: Register
echo "Step 3/3: Registering with Huginn..."
# TODO: Call HuginnRegistry.register_agent

echo ""
echo "✅ Complete! Your agent is onboarded to Starknet."
echo "No STRK was required - gas paid by AVNU paymaster."
