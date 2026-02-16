#!/usr/bin/env npx tsx
/**
 * Full Stack Swarm (Sepolia)
 *
 * - Deploy N SessionAccount contracts (owner keys generated locally).
 * - Mint ERC-8004 identities (gasless via AVNU paymaster).
 * - Register a session key + spending policy on-chain.
 * - Start SISNA as a signer boundary (holds session private keys).
 * - Run AVNU swaps via @starknet-agentic/mcp-server in signer proxy mode.
 * - Prove on-chain denial by attempting an oversized swap.
 *
 * Output:
 * - state.json (contains keys; chmod 0600 best-effort)
 * - stdout JSON report (safe-ish but avoid pasting blindly if it includes addresses/txs you don't want public)
 */

import dotenv from "dotenv";
import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Account, RpcProvider, ec, extractContractHashes, num } from "starknet";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- Static token addresses (Starknet mainnet/sepolia canonical addresses) ---
const TOKENS: Record<string, string> = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// --- CLI args ---
function parseArgs(): { network: string } {
  const args = process.argv.slice(2);
  let network = "sepolia";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--network") network = args[++i] ?? network;
  }
  return { network };
}

function envString(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  return v.trim();
}

function required(name: string): string {
  const v = envString(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function envInt(name: string, fallback: number): number {
  const raw = envString(name, String(fallback))!;
  const v = Number.parseInt(raw, 10);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function envBool(name: string, fallback = false): boolean {
  const raw = (envString(name, fallback ? "1" : "0") || "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y";
}

function envBigInt(name: string): bigint {
  const raw = required(name);
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`${name} must be an integer (decimal or 0x-hex)`);
  }
}

function toU256Calldata(value: bigint): [string, string] {
  const low = value & ((1n << 128n) - 1n);
  const high = value >> 128n;
  return [num.toHex(low), num.toHex(high)];
}

function tokenAddressFromSymbol(symbolOrAddress: string): string {
  if (symbolOrAddress.startsWith("0x")) return symbolOrAddress;
  const resolved = TOKENS[symbolOrAddress];
  if (!resolved) {
    throw new Error(`Unknown token symbol: ${symbolOrAddress}. Use ETH/STRK/USDC/USDT or a 0x address.`);
  }
  return resolved;
}

function randomPrivateKeyHex(): string {
  while (true) {
    const raw = BigInt(`0x${randomBytes(32).toString("hex")}`);
    // Keep within felt range (<= 2^251 - 1) to avoid encoding failures.
    const felt = raw & ((1n << 251n) - 1n);
    if (felt === 0n) continue;
    return num.toHex(felt);
  }
}

function pubKeyFromPriv(privHex: string): string {
  return num.toHex((ec as any).starkCurve.getStarkKey(privHex));
}

function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = async () => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
  };

  const release = () => {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  };

  return { acquire, release };
}

function parseToolTextJson(toolResponse: any): any {
  const text = toolResponse?.content?.find?.((c: any) => c?.type === "text")?.text;
  if (typeof text !== "string") return { raw: toolResponse };
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

class McpSidecar {
  private client: Client | null = null;
  constructor(
    private readonly label: string,
    private readonly env: Record<string, string>,
  ) {}

  async connect(): Promise<void> {
    // Use the local built MCP server for correctness: it depends on other workspace packages
    // that are expected to be built (e.g. x402-starknet).
    const mcpEntry = path.resolve(SCRIPT_DIR, "../../packages/starknet-mcp-server/dist/index.js");
    const transport = new StdioClientTransport({
      command: "node",
      args: [mcpEntry],
      env: { ...process.env, ...this.env },
    });

    const client = new Client(
      { name: `full-stack-swarm-${this.label}`, version: "0.1.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    this.client = client;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.client) throw new Error("MCP client not connected");
    const res = await this.client.callTool({ name, arguments: args });
    if (res?.isError) {
      const msg = res?.content?.[0]?.text || `Tool error: ${name}`;
      throw new Error(msg);
    }
    return res;
  }
}

function startSisna(args: {
  sisnaDir: string;
  port: number;
  hmacSecret: string;
  signingKeysById: Record<string, string>;
  allowedKeyIdsByClientId: Record<string, string[]>;
}) {
  const defaultKeyId = Object.keys(args.signingKeysById)[0];
  if (!defaultKeyId) {
    throw new Error("Internal error: no signing keys provided to SISNA");
  }
  const defaultClientId = Object.keys(args.allowedKeyIdsByClientId)[0];
  if (!defaultClientId) {
    throw new Error("Internal error: no auth clients provided to SISNA");
  }
  const keyringAllowedChainIds = "0x534e5f5345504f4c4941"; // "SN_SEPOLIA" as felt
  const env = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(args.port),
    HOST: "127.0.0.1",
    KEYRING_TRANSPORT: "http",
    KEYRING_ALLOWED_CHAIN_IDS: keyringAllowedChainIds,
    KEYRING_HMAC_SECRET: args.hmacSecret,
    KEYRING_DEFAULT_AUTH_CLIENT_ID: defaultClientId,
    // SISNA requires KEYRING_DEFAULT_KEY_ID to exist in signing keys.
    KEYRING_DEFAULT_KEY_ID: defaultKeyId,
    KEYRING_SIGNING_KEYS_JSON: JSON.stringify(
      Object.entries(args.signingKeysById).map(([keyId, privateKey]) => ({ keyId, privateKey })),
    ),
    KEYRING_AUTH_CLIENTS_JSON: JSON.stringify(
      Object.entries(args.allowedKeyIdsByClientId).map(([clientId, allowedKeyIds]) => ({
        clientId,
        hmacSecret: args.hmacSecret,
        allowedKeyIds,
      })),
    ),
  };

  const child = spawn("npm", ["run", "dev"], { cwd: args.sisnaDir, env, stdio: "inherit" });

  const stop = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 2_000);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  };

  return { child, stop, proxyUrl: `http://127.0.0.1:${args.port}` };
}

function declareSessionAccountIfRequested(args: {
  enabled: boolean;
  repoRoot: string;
  expectedClassHash: string;
  rpcUrl: string;
  deployerAddress: string;
  deployerPrivateKey: string;
}) {
  if (!args.enabled) return { ran: false };

  const pkgDir = path.join(args.repoRoot, "contracts/session-account");
  execSync("scarb build", { cwd: pkgDir, stdio: "inherit" });

  const targetDir = path.join(pkgDir, "target/dev");
  const sierraPath = path.join(targetDir, "session_account_SessionAccount.contract_class.json");
  const casmPath = path.join(
    targetDir,
    "session_account_SessionAccount.compiled_contract_class.json",
  );
  const sierra = JSON.parse(fs.readFileSync(sierraPath, "utf8"));
  const casm = JSON.parse(fs.readFileSync(casmPath, "utf8"));
  const hashes = extractContractHashes({ contract: sierra, casm });

  const normalizedExpected = `0x${args.expectedClassHash.slice(2).toLowerCase()}`;
  const normalizedComputed = `0x${String(hashes.classHash).slice(2).toLowerCase()}`;
  if (normalizedComputed !== normalizedExpected) {
    throw new Error(`SessionAccount class hash mismatch: expected ${normalizedExpected}, got ${hashes.classHash}`);
  }

  const provider = new RpcProvider({ nodeUrl: args.rpcUrl });
  const account = new Account({ provider, address: args.deployerAddress, signer: args.deployerPrivateKey });
  // Declare if not already declared.
  // NOTE: declareIfNot exists in starknet.js v8 and is what Starkclaw uses for pinned builds.
  return account.declareIfNot({ contract: sierra, casm }).then(() => ({ ran: true }));
}

async function main() {
  dotenv.config({ path: path.join(SCRIPT_DIR, ".env") });

  const { network } = parseArgs();
  if (network !== "sepolia") {
    throw new Error(`Only sepolia is supported by this demo right now (got network=${network}).`);
  }

  const repoRoot = path.resolve(SCRIPT_DIR, "../..");

  const rpcUrl = required("STARKNET_RPC_URL");
  const deployerAddress = required("DEPLOYER_ADDRESS");
  const deployerPrivateKey = required("DEPLOYER_PRIVATE_KEY");

  const avnuBaseUrl = required("AVNU_BASE_URL");
  const avnuPaymasterUrl = required("AVNU_PAYMASTER_URL");
  const avnuPaymasterApiKey = required("AVNU_PAYMASTER_API_KEY");
  const gasfree = envBool("GASFREE", true);
  const gasfreeOwner = envBool("GASFREE_OWNER", gasfree);
  const gasfreeSwap = envBool("GASFREE_SWAP", gasfree);

  const identityRegistry = required("ERC8004_IDENTITY_REGISTRY_ADDRESS");
  const sessionAccountClassHash = required("SESSION_ACCOUNT_CLASS_HASH");
  const declareClass = envBool("DECLARE_SESSION_ACCOUNT_CLASS", false);

  const agentCount = envInt("AGENT_COUNT", 5);
  const concurrency = envInt("CONCURRENCY", 2);
  const resume = envBool("RESUME", false);

  const sellToken = required("SELL_TOKEN");
  const buyToken = required("BUY_TOKEN");
  const amount = required("AMOUNT");
  const slippage = Number(envString("SLIPPAGE", "0.01"));

  const maxCalls = envInt("MAX_CALLS", 25);
  const sessionSignValiditySeconds = envInt("SESSION_SIGN_VALIDITY_SECONDS", 7200);
  const sessionKeyLifetimeSeconds = envInt("SESSION_KEY_LIFETIME_SECONDS", 86400);
  if (sessionKeyLifetimeSeconds < sessionSignValiditySeconds) {
    throw new Error("SESSION_KEY_LIFETIME_SECONDS must be >= SESSION_SIGN_VALIDITY_SECONDS");
  }

  const spendingTokenSymbol = required("SPENDING_TOKEN_SYMBOL");
  const maxPerCallRaw = envBigInt("MAX_PER_CALL_RAW");
  const maxPerWindowRaw = envBigInt("MAX_PER_WINDOW_RAW");
  const windowSeconds = envInt("WINDOW_SECONDS", 86400);

  const tokenUriBase = required("TOKEN_URI_BASE");

  const paymasterFeeMode = (envString("AVNU_PAYMASTER_FEE_MODE", "default") || "default") as
    | "default"
    | "sponsored";
  const paymasterGasToken = envString("PAYMASTER_GAS_TOKEN", "STRK") || "STRK";

  const fundBeforeRun = envBool("FUND_BEFORE_RUN", true);
  const fundEthRaw = envBigInt("FUND_ETH_RAW");
  const fundGasTokenRaw = envBigInt("FUND_GAS_TOKEN_RAW");

  const startSisnaFlag = envBool("START_SISNA", true);
  const sisnaDir = envString("SISNA_DIR", "");
  const sisnaPort = envInt("SISNA_PORT", 8545);
  const keyringHmacSecret = required("KEYRING_HMAC_SECRET");
  const externalProxyUrl = envString("KEYRING_PROXY_URL", "");

  const spendingTokenAddress = tokenAddressFromSymbol(spendingTokenSymbol);
  const paymasterGasTokenAddress = tokenAddressFromSymbol(paymasterGasToken);
  const ethTokenAddress = TOKENS.ETH;

  // Optional: declare SessionAccount from source (pins against SESSION_ACCOUNT_CLASS_HASH)
  await declareSessionAccountIfRequested({
    enabled: declareClass,
    repoRoot,
    expectedClassHash: sessionAccountClassHash,
    rpcUrl,
    deployerAddress,
    deployerPrivateKey,
  });

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const deployer = new Account({ provider, address: deployerAddress, signer: deployerPrivateKey });

  const statePath = path.join(SCRIPT_DIR, "state.json");
  let state: any | null = null;
  if (resume && fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  }
  if (!state) {
    state = {
      version: "1",
      created_at: new Date().toISOString(),
      network,
      rpcUrl,
      identityRegistry,
      sessionAccountClassHash,
      agents: [],
    };

    // 1) Deploy SessionAccount instances
    for (let i = 1; i <= agentCount; i += 1) {
      const ownerPrivateKey = randomPrivateKeyHex();
      const ownerPublicKey = pubKeyFromPriv(ownerPrivateKey);
      const { transaction_hash, address } = await deployer.deployContract({
        classHash: sessionAccountClassHash,
        constructorCalldata: [ownerPublicKey],
      });
      await provider.waitForTransaction(transaction_hash, { retries: 120, retryInterval: 3_000 });
      state.agents.push({
        id: i,
        sessionAccountAddress: address,
        ownerPrivateKey,
        ownerPublicKey,
        deployTxHash: transaction_hash,
        agentId: null,
        sessionKeyId: `agent-${i}`,
        sessionPrivateKey: null,
        sessionPublicKey: null,
      });
    }
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  try { fs.chmodSync(statePath, 0o600); } catch {}

  // 1.5) Fund accounts if using paymaster default fees or if swaps need sell token.
  // This is intentionally simple: transfer ETH (for the swap) + paymaster gas token (for fees).
  if (fundBeforeRun) {
    // IMPORTANT: all funding transfers are sent from the single deployer account.
    // Nonces must be strictly sequential, so we serialize funding transactions.
    const semFund = createSemaphore(1);
    await Promise.all(
      (state.agents as any[]).map((agent) =>
        (async () => {
          await semFund.acquire();
          try {
            const calls: any[] = [];

            if (fundEthRaw > 0n) {
              const [low, high] = toU256Calldata(fundEthRaw);
              calls.push({
                contractAddress: ethTokenAddress,
                entrypoint: "transfer",
                calldata: [agent.sessionAccountAddress, low, high],
              });
            }

            if (fundGasTokenRaw > 0n) {
              const [low, high] = toU256Calldata(fundGasTokenRaw);
              calls.push({
                contractAddress: paymasterGasTokenAddress,
                entrypoint: "transfer",
                calldata: [agent.sessionAccountAddress, low, high],
              });
            }

            if (calls.length > 0) {
              const { transaction_hash } = await deployer.execute(calls);
              await provider.waitForTransaction(transaction_hash, { retries: 120, retryInterval: 3_000 });
              agent.fundTxHash = transaction_hash;
            }
          } finally {
            semFund.release();
          }
        })(),
      ),
    );
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    try { fs.chmodSync(statePath, 0o600); } catch {}
  }

  // 2) Configure each agent (owner-signed direct mode)
  const sem = createSemaphore(concurrency);
  const ownerResults = await Promise.all(
    state.agents.map((agent: any) =>
      (async () => {
        await sem.acquire();
        const sidecar = new McpSidecar(`owner-${agent.id}`, {
        STARKNET_RPC_URL: rpcUrl,
        STARKNET_ACCOUNT_ADDRESS: agent.sessionAccountAddress,
        STARKNET_PRIVATE_KEY: agent.ownerPrivateKey,
        STARKNET_SIGNER_MODE: "direct",
        AVNU_BASE_URL: avnuBaseUrl,
          AVNU_PAYMASTER_URL: avnuPaymasterUrl,
          AVNU_PAYMASTER_API_KEY: avnuPaymasterApiKey,
          AVNU_PAYMASTER_FEE_MODE: paymasterFeeMode,
          ERC8004_IDENTITY_REGISTRY_ADDRESS: identityRegistry,
        });
        try {
          await sidecar.connect();

          if (!agent.agentId) {
            const tokenUri = `${tokenUriBase}${tokenUriBase.includes("?") ? "&" : "?"}agent=${agent.id}`;
            const reg = parseToolTextJson(
              await sidecar.callTool("starknet_register_agent", { token_uri: tokenUri, gasfree: gasfreeOwner }),
            );
            agent.agentId = reg.agentId ?? null;
          }

          if (agent.agentId) {
            await sidecar.callTool("starknet_invoke_contract", {
              contractAddress: agent.sessionAccountAddress,
              entrypoint: "set_agent_id",
              calldata: [String(agent.agentId)],
              gasfree: gasfreeOwner,
            });
          }

          // Register session key (empty whitelist => allow all non-admin selectors)
          if (!agent.sessionPrivateKey || !agent.sessionPublicKey) {
            agent.sessionPrivateKey = randomPrivateKeyHex();
            agent.sessionPublicKey = pubKeyFromPriv(agent.sessionPrivateKey);
            const validUntil = Math.floor(Date.now() / 1000) + sessionKeyLifetimeSeconds;
            await sidecar.callTool("starknet_invoke_contract", {
              contractAddress: agent.sessionAccountAddress,
              entrypoint: "add_or_update_session_key",
              calldata: [agent.sessionPublicKey, String(validUntil), String(maxCalls), "0"],
              gasfree: gasfreeOwner,
            });
          }

          // Spending policy for the sell token (per-call + per-window)
          const [maxPerCallLow, maxPerCallHigh] = toU256Calldata(maxPerCallRaw);
          const [maxPerWindowLow, maxPerWindowHigh] = toU256Calldata(maxPerWindowRaw);
          await sidecar.callTool("starknet_invoke_contract", {
            contractAddress: agent.sessionAccountAddress,
            entrypoint: "set_spending_policy",
            calldata: [
              agent.sessionPublicKey,
              spendingTokenAddress,
              maxPerCallLow,
              maxPerCallHigh,
              maxPerWindowLow,
              maxPerWindowHigh,
              String(windowSeconds),
            ],
            gasfree: gasfreeOwner,
          });

          return { agent: agent.id, ok: true, agentId: agent.agentId, sessionPublicKey: agent.sessionPublicKey };
        } catch (e) {
          return { agent: agent.id, ok: false, error: e instanceof Error ? e.message : String(e) };
        } finally {
          await sidecar.close();
          sem.release();
        }
      })(),
    ),
  );

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  try { fs.chmodSync(statePath, 0o600); } catch {}

  // 3) Start SISNA (optional)
  let sisna: any = null;
  let proxyUrl = externalProxyUrl || "";
  if (startSisnaFlag) {
    if (!sisnaDir) throw new Error("START_SISNA=1 requires SISNA_DIR to be set");
    const signingKeysById: Record<string, string> = {};
    const allowedKeyIdsByClientId: Record<string, string[]> = {};
    for (const agent of state.agents as any[]) {
      if (!agent.sessionPrivateKey) continue;
      signingKeysById[agent.sessionKeyId] = agent.sessionPrivateKey;
      allowedKeyIdsByClientId[`mcp-${agent.sessionKeyId}`] = [agent.sessionKeyId];
    }

    if (Object.keys(signingKeysById).length === 0) {
      // Don't start SISNA if we failed to configure any session keys.
      proxyUrl = "";
    } else {
    const started = startSisna({
      sisnaDir: path.resolve(SCRIPT_DIR, sisnaDir),
      port: sisnaPort,
      hmacSecret: keyringHmacSecret,
      signingKeysById,
      allowedKeyIdsByClientId,
    });
    sisna = started;
    proxyUrl = started.proxyUrl;
    await new Promise((r) => setTimeout(r, 1_200));
    }
  }

  if (!proxyUrl) {
    throw new Error("No KEYRING_PROXY_URL available. Set START_SISNA=1 or configure KEYRING_PROXY_URL.");
  }

  // 4) Proxy-signed AVNU trades (session keys held by SISNA)
  const tradeSem = createSemaphore(concurrency);
  const tradeResults = await Promise.all(
    state.agents.map((agent: any) =>
      (async () => {
        await tradeSem.acquire();
        const sidecar = new McpSidecar(`trade-${agent.id}`, {
        STARKNET_RPC_URL: rpcUrl,
        STARKNET_ACCOUNT_ADDRESS: agent.sessionAccountAddress,
        STARKNET_SIGNER_MODE: "proxy",
        AVNU_BASE_URL: avnuBaseUrl,
        AVNU_PAYMASTER_URL: avnuPaymasterUrl,
        AVNU_PAYMASTER_API_KEY: avnuPaymasterApiKey,
        AVNU_PAYMASTER_FEE_MODE: paymasterFeeMode,
        ERC8004_IDENTITY_REGISTRY_ADDRESS: identityRegistry,
        KEYRING_PROXY_URL: proxyUrl,
        KEYRING_HMAC_SECRET: keyringHmacSecret,
        KEYRING_CLIENT_ID: `mcp-${agent.sessionKeyId}`,
        KEYRING_SIGNING_KEY_ID: agent.sessionKeyId,
        KEYRING_SESSION_VALIDITY_SECONDS: String(sessionSignValiditySeconds),
      });
        try {
          await sidecar.connect();

          const balanceTokens = Array.from(new Set(["ETH", "STRK", sellToken, buyToken]));
          const balances = parseToolTextJson(
            await sidecar.callTool("starknet_get_balances", { tokens: balanceTokens }),
          );
          const quote = parseToolTextJson(
            await sidecar.callTool("starknet_get_quote", { sellToken, buyToken, amount }),
          );
          const swap = parseToolTextJson(
            await sidecar.callTool("starknet_swap", {
              sellToken,
              buyToken,
              amount,
              slippage,
              gasfree: gasfreeSwap,
              ...(paymasterFeeMode === "default" ? { gasToken: paymasterGasToken } : {}),
            }),
          );

          // Prove policy denial by exceeding per-call cap.
          // Keep it deterministic: use a raw amount multiplier.
          let deniedByPolicy: boolean | null = null;
          try {
            await sidecar.callTool("starknet_swap", {
              sellToken,
              buyToken,
              amount: String(Number(amount) * 10),
              slippage,
              gasfree: gasfreeSwap,
              ...(paymasterFeeMode === "default" ? { gasToken: paymasterGasToken } : {}),
            });
            deniedByPolicy = false;
          } catch {
            deniedByPolicy = true;
          }

          return { agent: agent.id, ok: true, balances, quote, swap, deniedByPolicy };
        } catch (e) {
          return { agent: agent.id, ok: false, error: e instanceof Error ? e.message : String(e) };
        } finally {
          await sidecar.close();
          tradeSem.release();
        }
      })(),
    ),
  );

  const ok =
    ownerResults.every((r: any) => r.ok) &&
    tradeResults.every((r: any) => r.ok);

  const report = {
    ok,
    generated_at: new Date().toISOString(),
    network,
    config: {
      agentCount,
      concurrency,
      gasfree,
      gasfreeOwner,
      gasfreeSwap,
      sellToken,
      buyToken,
      amount,
      slippage,
      sessionSignValiditySeconds,
      sessionKeyLifetimeSeconds,
      spendingTokenSymbol,
      maxPerCallRaw: String(maxPerCallRaw),
      maxPerWindowRaw: String(maxPerWindowRaw),
      windowSeconds,
      maxCalls,
    },
    ownerConfig: ownerResults,
    results: tradeResults,
    stateFile: statePath,
    sisna: { started: Boolean(sisna), proxyUrl },
  };

  console.log(JSON.stringify(report, null, 2));

  if (sisna) await sisna.stop();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
