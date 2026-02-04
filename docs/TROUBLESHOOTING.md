# Troubleshooting Guide

Common issues and solutions when building with Starknet Agentic.

## Quick Diagnostics

Run this command to check your setup:

```bash
# Check environment variables
node -e "console.log({
  rpc: process.env.STARKNET_RPC_URL ? '✅' : '❌ Missing',
  address: process.env.STARKNET_ACCOUNT_ADDRESS ? '✅' : '❌ Missing',
  key: process.env.STARKNET_PRIVATE_KEY ? '✅' : '❌ Missing'
})"

# Test RPC connection
curl $STARKNET_RPC_URL -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"starknet_chainId","params":[],"id":1}'
```

Expected output:
```json
{"jsonrpc":"2.0","result":"0x534e5f5345504f4c4941","id":1}
```

---

## Common Errors

### 1. `Error: Invalid private key`

**Symptoms:**
```
Error: Invalid private key or address format
```

**Causes:**
- Private key doesn't start with `0x`
- Private key is truncated or malformed
- Using the wrong account type (EOA vs. contract account)

**Solutions:**

```bash
# Verify private key format (should be 66 characters: 0x + 64 hex digits)
echo $STARKNET_PRIVATE_KEY | wc -c  # Should output 67 (66 + newline)

# Check if it starts with 0x
echo $STARKNET_PRIVATE_KEY | grep "^0x"

# Re-export from ArgentX:
# 1. Open ArgentX
# 2. Settings → Account → Export Private Key
# 3. Copy the FULL key including 0x prefix
```

---

### 2. `Error: INSUFFICIENT_BALANCE` or `FEE_TRANSFER_FAILURE`

**Symptoms:**
```
Transaction failed: FEE_TRANSFER_FAILURE
Max fee exceeds balance
```

**Causes:**
- Not enough ETH/STRK to pay gas fees
- Trying to transfer more tokens than you have
- Gas estimation is too high

**Solutions:**

```bash
# Check your ETH balance (needed for gas)
cd skills/starknet-wallet
npm run check-balance

# Get testnet tokens from faucet
# Sepolia: https://faucet.goerli.starknet.io/
# Or use Starknet Discord #faucet channel
```

**Use gasless mode to pay gas in tokens:**

```typescript
const result = await mcpClient.callTool({
  name: "starknet_transfer",
  arguments: {
    recipient: "0x...",
    token: "USDC",
    amount: "100",
    gasfree: true,      // Pay gas in USDC instead of ETH
    gasToken: "USDC",
  }
});
```

---

### 3. `Error: INVALID_NONCE` or `Nonce mismatch`

**Symptoms:**
```
Transaction failed: Invalid transaction nonce
Expected nonce X, got Y
```

**Causes:**
- Sent multiple transactions simultaneously
- Transaction failed but nonce was consumed
- Account state is out of sync with RPC

**Solutions:**

```typescript
// ❌ Don't do this (race condition):
await Promise.all([
  transfer("0xabc", "ETH", "1"),
  transfer("0xdef", "ETH", "1"),
]);

// ✅ Do this (sequential):
await transfer("0xabc", "ETH", "1");
await transfer("0xdef", "ETH", "1");

// OR use multi-call (single transaction):
await account.execute([
  { contractAddress: eth, entrypoint: "transfer", ... },
  { contractAddress: eth, entrypoint: "transfer", ... },
]);
```

**Force nonce refresh:**

```typescript
// Get fresh nonce from network
const nonce = await account.getNonce();
console.log("Current nonce:", nonce);

// Use specific nonce
await account.execute({...}, { nonce });
```

---

### 4. `Error: Request failed with status 429` (Rate Limiting)

**Symptoms:**
```
RPC request failed: 429 Too Many Requests
Rate limit exceeded
```

**Causes:**
- Too many RPC calls in short time
- Free tier RPC limits reached
- Using batch queries incorrectly

**Solutions:**

```typescript
// ❌ Bad: Many sequential RPC calls
for (const token of tokens) {
  await getBalance(token);  // Separate RPC call each time
}

// ✅ Good: Single batch call
const balances = await getBatchBalances(tokens);  // One RPC call

// Add delays between requests
await sleep(100);  // 100ms delay
```

**Use paid RPC for production:**
- [Alchemy](https://www.alchemy.com/starknet) - 300M compute units/month free
- [Infura](https://www.infura.io/networks/starknet) - 100K requests/day free
- [Blast API](https://blastapi.io/public-api/starknet) - Public endpoints

---

### 5. `Error: Contract not found` or `Class hash not found`

**Symptoms:**
```
Error: Contract at address 0x... not found
StarknetErrorCode.CLASS_HASH_NOT_FOUND
```

**Causes:**
- Using mainnet contract address on testnet (or vice versa)
- Contract not deployed yet
- Typo in contract address

**Solutions:**

```typescript
// ✅ Use environment-specific addresses
const TOKEN_ADDRESS = process.env.NETWORK === 'mainnet'
  ? "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"  // Mainnet ETH
  : "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // Sepolia ETH

// Verify contract exists
const classHash = await provider.getClassHashAt(contractAddress);
console.log("Contract exists:", classHash);
```

**Check network:**

```typescript
const chainId = await provider.getChainId();
console.log("Connected to:", chainId);
// Mainnet: 0x534e5f4d41494e (SN_MAIN)
// Sepolia: 0x534e5f5345504f4c4941 (SN_SEPOLIA)
```

---

### 6. `Error: TRANSACTION_REVERTED` or Contract execution failed

**Symptoms:**
```
Execution was reverted
Error in the called contract
```

**Causes:**
- Contract logic rejected the transaction
- Insufficient token allowance
- Invalid function parameters
- Contract bug or assert failed

**Solutions:**

```bash
# Enable detailed error messages
export DEBUG=starknet:*
node your-script.ts

# Check transaction on explorer
# Sepolia: https://sepolia.voyager.online/tx/0x...
# Mainnet: https://voyager.online/tx/0x...
```

**Common fixes:**

```typescript
// 1. Check allowance before swap
const allowance = await tokenContract.allowance(owner, spender);
if (allowance < amount) {
  await tokenContract.approve(spender, amount);
}

// 2. Verify parameters match contract ABI
const calldata = CallData.compile({
  recipient: validateAndParseAddress(recipient),  // Normalize address
  amount: cairo.uint256(amount),                  // Proper uint256 format
});

// 3. Estimate gas before executing
const estimate = await account.estimateInvokeFee({...});
console.log("Estimated gas:", estimate.overall_fee);
```

---

### 7. MCP Server Not Working with Claude/Cursor

**Symptoms:**
- Claude doesn't show Starknet tools
- MCP server crashes on startup
- Environment variables not loaded

**Solutions:**

**1. Verify MCP server builds:**

```bash
cd packages/starknet-mcp-server
pnpm build
node dist/index.js  # Should start without errors
```

**2. Check Claude Desktop config:**

```bash
# Location: ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)
# or: %APPDATA%\Claude\claude_desktop_config.json (Windows)

cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**3. Verify environment variables are set:**

```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": ["/FULL/PATH/TO/starknet-mcp-server/dist/index.js"],
      "env": {
        "STARKNET_RPC_URL": "https://...",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

**4. Restart Claude Desktop completely:**

```bash
# Mac
killall Claude && open -a Claude

# Check MCP server logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

---

### 8. Build Errors

**Symptoms:**
```
Error: Cannot find module 'starknet'
Type error: Property X does not exist
```

**Solutions:**

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Rebuild everything
pnpm clean  # if available
pnpm build

# Check Node version (must be 18+)
node --version

# Check pnpm version
pnpm --version  # Should be 8.0+
```

**TypeScript errors:**

```bash
# Regenerate types
cd packages/starknet-mcp-server
pnpm build

# Check tsconfig.json includes node_modules/@types
cat tsconfig.json
```

---

### 9. Swap/Quote Errors (AVNU)

**Symptoms:**
```
No quotes available for this token pair
Insufficient liquidity
```

**Solutions:**

```typescript
// 1. Check token pair has liquidity
// Use AVNU API to verify supported pairs
const response = await fetch('https://sepolia.api.avnu.fi/tokens');
const tokens = await response.json();
console.log("Supported tokens:", tokens);

// 2. Try smaller amounts
// Large swaps may have insufficient liquidity on testnet

// 3. Increase slippage tolerance
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.05,  // 5% instead of 1%
  executeApprove: true,
});

// 4. Check quote hasn't expired (valid for ~30 seconds)
const quotes = await getQuotes({...});
const bestQuote = quotes[0];
// Use immediately, don't delay
await executeSwap({...});
```

---

## Performance Issues

### Slow Balance Queries

**Problem:** Checking multiple token balances takes too long

**Solution:** Use batch balance queries

```typescript
// ❌ Slow: 4 separate RPC calls
const ethBalance = await getBalance("ETH");
const strkBalance = await getBalance("STRK");
const usdcBalance = await getBalance("USDC");
const usdtBalance = await getBalance("USDT");

// ✅ Fast: 1 RPC call via BalanceChecker contract
const balances = await mcpClient.callTool({
  name: "starknet_get_balances",
  arguments: {
    address: "0x...",
    tokens: ["ETH", "STRK", "USDC", "USDT"],
  }
});
```

### High Gas Costs

**Problem:** Transactions cost too much gas

**Solutions:**

```typescript
// 1. Use multi-call for related operations
await account.execute([
  { contractAddress: tokenA, entrypoint: "approve", ... },
  { contractAddress: router, entrypoint: "swap", ... },
]);  // Single transaction = lower total gas

// 2. Use gasless mode (paymaster)
// Pay gas in tokens instead of ETH

// 3. Batch operations when possible
// Update multiple agents in one transaction

// 4. Optimize calldata
// Use uint256 only when necessary, use felt252 for smaller numbers
```

---

## Debugging Tips

### Enable Debug Logging

```bash
# starknet.js debug logs
export DEBUG=starknet:*

# All debug logs
export DEBUG=*

# Run your script
node your-script.ts
```

### Inspect Transactions

```typescript
// Get transaction receipt
const receipt = await provider.getTransactionReceipt(txHash);
console.log("Status:", receipt.execution_status);
console.log("Events:", receipt.events);

// Check transaction trace (detailed execution)
const trace = await provider.getTransactionTrace(txHash);
console.log("Execution trace:", trace);
```

### Test on Sepolia First

Always test on Sepolia testnet before mainnet:

```typescript
const NETWORK = process.env.NETWORK || 'sepolia';

const RPC_URLS = {
  sepolia: 'https://starknet-sepolia.g.alchemy.com/v2/YOUR_KEY',
  mainnet: 'https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY',
};

const provider = new RpcProvider({ nodeUrl: RPC_URLS[NETWORK] });
```

---

## Getting Help

### Before Opening an Issue

1. ✅ Check this troubleshooting guide
2. ✅ Search [existing issues](https://github.com/keep-starknet-strange/starknet-agentic/issues)
3. ✅ Enable debug logging and include output
4. ✅ Provide minimal reproduction code

### Where to Ask

- **Bugs:** [GitHub Issues](https://github.com/keep-starknet-strange/starknet-agentic/issues/new)
- **Questions:** [GitHub Discussions](https://github.com/keep-starknet-strange/starknet-agentic/discussions)
- **Chat:** Join #starknet-agentic on Discord
- **Starknet Issues:** [Starknet Discord](https://discord.gg/starknet)

### Useful Resources

- [Starknet Documentation](https://docs.starknet.io/)
- [starknet.js Docs](https://www.starknetjs.com/)
- [AVNU Documentation](https://docs.avnu.fi/)
- [Voyager Block Explorer](https://voyager.online/)
- [Starkscan](https://starkscan.co/)

---

## Still Stuck?

Open an issue with:

1. **Environment Info:**
   ```bash
   node --version
   pnpm --version
   cat package.json | grep starknet
   ```

2. **Error Message:** Full error output with stack trace

3. **Code Sample:** Minimal code that reproduces the issue

4. **What You've Tried:** Steps you've already taken

We're here to help! 🚀
