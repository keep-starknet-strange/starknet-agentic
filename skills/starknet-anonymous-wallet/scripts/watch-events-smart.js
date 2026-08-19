#!/usr/bin/env node
/**
 * typhoon-starknet-account: watch-events-smart.js
 * 
 * Smart event watcher with continuous health monitoring.
 * Starts with WebSocket, monitors health, falls back to polling if WebSocket fails.
 * Can also recover back to WebSocket if it becomes available again.
 * 
 * INPUT: JSON as first argument
 * { 
 *   "contractAddress": "0x...", 
 *   "eventNames": ["JobListed"],
 *   "pollIntervalMs": 3000, // fallback polling interval
 *   "webhookUrl": "http://localhost:3000/webhook", // CLI JSON only; file-backed cron uses WEBHOOK_URL
 *   "schedule": { // optional - creates cron job
 *     "enabled": true,
 *     "name": "ekubo-swap-monitor"
 *   },
 *   "wsRpcUrl": "wss://rpc.starknet.lava.build/ws", // optional
 *   "httpRpcUrl": "https://rpc.starknet.lava.build", // optional
 *   "healthCheckIntervalMs": 30000, // optional, default: 30s
 *   "mode": "auto" // "auto", "websocket", "polling"
 * }
 */

import { RpcProvider, hash } from 'starknet';
import { WebSocket } from 'ws';
import { execSync, execFileSync } from 'child_process';
import { writeFileSync, chmodSync, mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync, mkdtempSync, rmSync, openSync, fstatSync, closeSync, constants as fsConstants } from 'fs';
import { tmpdir, homedir } from 'os';
import { join, basename } from 'path';

import { resolveRpcUrl } from './_rpc.js';

const DEFAULT_POLL_INTERVAL = 3000;
const DEFAULT_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const DEFAULT_WEBHOOK_TIMEOUT_MS = 5000;
const MAX_BLOCKS_PER_CYCLE = 200;
const DEFAULT_WS_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

function log(message, type = 'info', mode = 'unknown') {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    mode,
    message
  }));
}

function logEvent(eventData) {
  console.log(JSON.stringify(eventData));
}

const MAX_WEBHOOK_URL_LENGTH = 2048;

/**
 * Allow only http(s) webhook URLs and rebuild them from parsed parts.
 * Blocks credentials in the URL, non-http(s) schemes, and oversized values.
 * Does not block private, link-local, or loopback destinations.
 */
function sanitizeWebhookUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_WEBHOOK_URL_LENGTH) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  const path = parsed.pathname || '/';
  return parsed.protocol + '//' + parsed.host + path + parsed.search;
}

function copyIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    return '';
  }
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
    if (!ok) return '';
    out += String.fromCharCode(c);
  }
  return out;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseConfiguredEventNames(eventNames) {
  if (eventNames === undefined) {
    return { ok: true, names: [] };
  }
  if (!Array.isArray(eventNames)) {
    return { ok: false, error: '"eventNames" must be an array of identifiers' };
  }
  const names = [];
  for (const raw of eventNames) {
    const name = copyIdentifier(raw);
    if (!name) {
      return {
        ok: false,
        error: `"eventNames" contains an invalid identifier: ${JSON.stringify(raw)}`,
      };
    }
    names.push(name);
  }
  return { ok: true, names };
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toWebhookPayload(data) {
  const keys = Array.isArray(data?.keys) ? data.keys.map((key) => String(key)) : [];
  const eventData = Array.isArray(data?.data) ? data.data.map((item) => String(item)) : [];
  const blockNumber = toFiniteNumberOrNull(data?.blockNumber);
  return JSON.stringify({
    type: String(data?.type || 'event'),
    source: String(data?.source || ''),
    timestamp: String(data?.timestamp || ''),
    blockNumber,
    transactionHash: String(data?.transactionHash || ''),
    contractAddress: String(data?.contractAddress || ''),
    keys,
    data: eventData,
    eventName: copyIdentifier(data?.eventName) || 'unknown',
    selector: String(data?.selector || '')
  });
}

async function sendWebhook(webhookUrl, data, timeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS) {
  const safeUrl = sanitizeWebhookUrl(webhookUrl);
  if (!safeUrl) return;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(safeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: toWebhookPayload(data),
      signal: controller.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      log(`Webhook error: timeout after ${timeoutMs}ms`, 'warn');
    } else {
      log(`Webhook error: ${err.message}`, 'warn');
    }
  } finally {
    clearTimeout(id);
  }
}

function createCronJob(config) {
  const cronDir = join(homedir(), '.openclaw', 'cron');
  if (!existsSync(cronDir)) {
    mkdirSync(cronDir, { recursive: true });
  }

  const rawName = String(config.schedule?.name || '').trim();
  const safeName = rawName.replace(/[^A-Za-z0-9._-]/g, '').replace(/\.\./g, '');
  const jobName = safeName ? safeName : `watch-smart-${Date.now()}`;
  const configPath = join(cronDir, `${jobName}.json`);
  
  const execConfig = { ...config };
  // Keep durationMs if it exists (for TTL handling), only remove schedule metadata
  const scheduleInfo = execConfig.schedule;
  delete execConfig.schedule;
  const scheduledWebhookUrl = sanitizeWebhookUrl(execConfig.webhookUrl);
  delete execConfig.webhookUrl;
  
  // If duration was specified, add it to execConfig so the watcher knows when to self-destruct
  if (scheduleInfo?.durationMs) {
    execConfig.durationMs = scheduleInfo.durationMs;
  }
  
  writeFileSync(configPath, JSON.stringify(execConfig, null, 2));

  const scriptPath = new URL(import.meta.url).pathname;
  const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`;
  const webhookExport = scheduledWebhookUrl
    ? `export WEBHOOK_URL=${shellQuote(scheduledWebhookUrl)}\n`
    : '';

  const shellScript = `#!/bin/bash
cd "$(dirname "$0")"
${webhookExport}LOCKFILE=${shellQuote(`${configPath}.lock`)}
exec flock -n "$LOCKFILE" node ${shellQuote(scriptPath)} ${shellQuote(`@${configPath}`)}
`;
  const shellPath = join(cronDir, `${jobName}.sh`);
  writeFileSync(shellPath, shellScript, { mode: 0o700 });
  chmodSync(shellPath, 0o700);

  const cronEntry = `* * * * * ${shellPath} >> ${join(cronDir, `${jobName}.log`)} 2>&1`;
  
  try {
    let currentCrontab = '';
    try {
      currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
    } catch (e) {
      currentCrontab = '';
    }

    const lines = currentCrontab.split('\n').filter(line => !line.includes(shellPath));
    lines.push(cronEntry);
    
    const newCrontab = lines.join('\n') + '\n';
    const tmpDir = mkdtempSync(join(tmpdir(), 'starknet-crontab-'));
    const tmpCrontab = join(tmpDir, 'crontab.tmp');
    writeFileSync(tmpCrontab, newCrontab, { mode: 0o600 });
    execFileSync('crontab', [tmpCrontab]);
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { log(`Failed to remove temp crontab dir (${tmpDir}): ${e}`, 'warn'); }

    return {
      success: true,
      jobName,
      configPath,
      shellPath,
      logPath: join(cronDir, `${jobName}.log`),
      cronEntry
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

function deriveWebSocketUrl(httpUrl) {
  const value = String(httpUrl || '').trim();
  if (!value) return value;

  // Infura Starknet: https://starknet-mainnet.infura.io/v3/<KEY> -> wss://starknet-mainnet.infura.io/ws/v3/<KEY>
  if (/^https?:\/\/[^/]*\.infura\.io\/v3\//i.test(value)) {
    return value
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://')
      .replace(/\/v3\//i, '/ws/v3/');
  }

  // Default (Alchemy and most providers): preserve path, only switch scheme.
  return value
    .replace(/^https:\/\//i, 'wss://')
    .replace(/^http:\/\//i, 'ws://');
}

// Unified Event Watcher with mode switching
class SmartEventWatcher {
  constructor(config, webhookUrl) {
    this.config = config;
    const rpcUrl = config.httpRpcUrl || resolveRpcUrl();
    this.httpUrl = rpcUrl;
    // Derive WebSocket URL from HTTP URL if not explicitly provided
    this.wsUrl = config.wsRpcUrl || deriveWebSocketUrl(this.httpUrl);
    this.pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL;
    this.healthCheckIntervalMs = config.healthCheckIntervalMs || DEFAULT_HEALTH_CHECK_INTERVAL;
    this.webhookTimeoutMs = config.webhookTimeoutMs || DEFAULT_WEBHOOK_TIMEOUT_MS;
    this.webhookUrl = sanitizeWebhookUrl(webhookUrl);
    this.contractAddress = config.contractAddress;
    const parsedEventNames = parseConfiguredEventNames(config.eventNames);
    if (!parsedEventNames.ok) {
      throw new Error(parsedEventNames.error);
    }
    this.eventNames = parsedEventNames.names;
    this.forcedMode = config.mode || 'auto'; // 'auto', 'websocket', 'polling'
    this.currentMode = 'initializing';
    this.isShuttingDown = false;
    
    // WebSocket state
    this.ws = null;
    this.wsIsConnected = false;
    this.wsLastEventTime = null;
    this.wsReconnectAttempts = 0;
    this.maxWsReconnectAttempts = 5;
    this.lastWsFailureTime = null;
    this.wsRecoveryCooldownMs = config.wsRecoveryCooldownMs || DEFAULT_WS_RECOVERY_COOLDOWN_MS;
    this.jsonRpcId = 0;
    
    // Polling state
    this.provider = new RpcProvider({ nodeUrl: this.httpUrl });
    this.currentBlock = null;
    this.pollTimer = null;
    this.isPolling = false;
    
    // Shared state
    this.processedTxs = new Set();
    this.healthCheckTimer = null;
    this.eventBuffer = []; // Buffer events during mode switch
    
    // TTL (Time To Live) handling
    this.durationMs = config.durationMs || null;
    this.startTime = Date.now();
    this.ttlTimer = null;
    this.lastLoggedMinute = null;
  }

  log(message, type = 'info') {
    log(message, type, this.currentMode);
  }

  async start() {
    this.log('Starting smart event watcher...');
    this.log(`Contract: ${this.contractAddress}`);
    this.log(`Events: ${this.eventNames.join(', ')}`);
    this.log(`Mode preference: ${this.forcedMode}`);
    
    if (this.durationMs) {
      this.log(`Duration: ${this.durationMs}ms (${this.durationMs / 1000 / 60} minutes)`);
      this.startTTLCheck();
    }

    if (this.forcedMode === 'polling') {
      await this.startPolling();
    } else {
      // Try WebSocket first (even in auto mode)
      await this.tryWebSocket();
    }

    // Start health monitoring
    this.startHealthCheck();
  }
  
  // Start TTL (auto-expiry) check
  startTTLCheck() {
    if (!this.durationMs) return;
    
    this.ttlTimer = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      const remaining = this.durationMs - elapsed;
      
      if (remaining <= 0) {
        this.log(`TTL expired after ${this.durationMs}ms. Self-destructing...`, 'info');
        this.selfDestruct();
      } else {
        const currentMinute = Math.ceil(remaining / 1000 / 60);
        if (currentMinute !== this.lastLoggedMinute) {
          this.lastLoggedMinute = currentMinute;
          this.log(`TTL: ${currentMinute} minutes remaining`, 'info');
        }
      }
    }, 1000); // Check every second
  }
  
  // Self-destruct: stop watching and remove cron job
  async selfDestruct() {
    this.log('Executing self-destruct sequence...', 'info');
    
    // Stop all timers
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      this.ttlTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Stop watching
    this.stopWebSocket();
    this.stopPolling();
    
    // Remove cron job if this was started via cron
    try {
      const cronDir = join(homedir(), '.openclaw', 'cron');
      let removed = false;

      // Best-effort: if we know the job name (started from '@config.json'), remove deterministically
      const jobName = this.config.__jobName;
      const knownConfigPath = this.config.__configPath;
      if (jobName) {
        const shellPath = join(cronDir, `${jobName}.sh`);
        const configPath = join(cronDir, `${jobName}.json`);

        // Remove from crontab
        const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
        const lines = currentCrontab.split('\n').filter(line => !line.includes(shellPath));
        const newCrontab = lines.join('\n') + '\n';
        const tmpDir = mkdtempSync(join(tmpdir(), 'starknet-crontab-'));
        const tmpCrontab = join(tmpDir, 'crontab.tmp');
        writeFileSync(tmpCrontab, newCrontab, { mode: 0o600 });
        execFileSync('crontab', [tmpCrontab]);
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { this.log(`Failed to remove temp crontab dir (${tmpDir}): ${e}`, 'warn'); }

        // Delete files
        try { unlinkSync(shellPath); } catch (e) { this.log(`Failed to remove shellPath (${shellPath}): ${e}`, 'warn'); }
        try { unlinkSync(configPath); } catch (e) { this.log(`Failed to remove configPath (${configPath}): ${e}`, 'warn'); }

        this.log(`Removed cron job: ${jobName}`, 'info');
        removed = true;
      }

      // Fallback: scan cron dir for a shell script that references our config path
      if (!removed && knownConfigPath) {
        const files = readdirSync(cronDir);
        for (const file of files) {
          if (!file.endsWith('.sh')) continue;
          const shellPath = join(cronDir, file);
          // O_NOFOLLOW makes openSync throw ELOOP on symlinks, atomically
          // ruling out the symlink-swap TOCTOU between stat and read.
          let content;
          try {
            const fd = openSync(shellPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
            try {
              if (!fstatSync(fd).isFile()) continue;
              content = readFileSync(fd, 'utf8');
            } finally {
              closeSync(fd);
            }
          } catch {
            continue;
          }
          if (content.includes(knownConfigPath)) {
            const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
            const lines = currentCrontab.split('\n').filter(line => !line.includes(shellPath));
            const newCrontab = lines.join('\n') + '\n';
            const tmpDir = mkdtempSync(join(tmpdir(), 'starknet-crontab-'));
            const tmpCrontab = join(tmpDir, 'crontab.tmp');
            writeFileSync(tmpCrontab, newCrontab, { mode: 0o600 });
            execFileSync('crontab', [tmpCrontab]);
            try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { this.log(`Failed to remove temp crontab dir (${tmpDir}): ${e}`, 'warn'); }

            try { unlinkSync(shellPath); } catch (e) { this.log(`Failed to remove shellPath (${shellPath}): ${e}`, 'warn'); }
            const derivedConfigPath = shellPath.replace(/\.sh$/i, '.json');
            try { unlinkSync(derivedConfigPath); } catch (e) { this.log(`Failed to remove configPath (${derivedConfigPath}): ${e}`, 'warn'); }

            this.log(`Removed cron job: ${file}`, 'info');
            removed = true;
            break;
          }
        }
      }

      if (!removed) {
        this.log('No cron job found to remove (may have been manual run)', 'warn');
      }
    } catch (err) {
      this.log(`Error during self-destruct cleanup: ${err.message}`, 'error');
    }
    
    this.log('Self-destruct complete. Exiting.', 'info');
    process.exit(0);
  }

  // Try to connect via WebSocket
  async tryWebSocket() {
    if (this.isShuttingDown) return;
    
    this.log('Attempting WebSocket connection...');

    return new Promise((resolve) => {
      let connected = false;
      
      this.ws = new WebSocket(this.wsUrl);
      
      const connectionTimeout = setTimeout(() => {
        if (!connected) {
          this.log('WebSocket connection timeout', 'warn');
          this.ws.close();
          this.handleWebSocketFailure('timeout');
          resolve(false);
        }
      }, 10000);

      this.ws.on('open', () => {
        connected = true;
        clearTimeout(connectionTimeout);
        this.currentMode = 'websocket';
        this.wsIsConnected = true;
        this.wsReconnectAttempts = 0;
        this.log('WebSocket connected successfully');
        
        // Subscribe to events
        if (this.eventNames.length === 0) {
          const subscribeMsg = {
            jsonrpc: '2.0',
            method: 'starknet_subscribeEvents',
            params: {
              address: this.contractAddress
            },
            id: ++this.jsonRpcId
          };
          this.ws.send(JSON.stringify(subscribeMsg));
        } else {
          for (const eventName of this.eventNames) {
            const eventSelector = hash.getSelectorFromName(eventName);
            const subscribeMsg = {
              jsonrpc: '2.0',
              method: 'starknet_subscribeEvents',
              params: {
                address: this.contractAddress,
                keys: [[eventSelector]]
              },
              id: ++this.jsonRpcId
            };
            this.ws.send(JSON.stringify(subscribeMsg));
          }
        }
        
        resolve(true);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          
          // Handle subscription confirmation
          if (msg.result !== undefined && typeof msg.result === 'number') {
            this.log(`Subscribed with ID: ${msg.result}`);
            return;
          }
          
          // Handle error (unsupported method)
          if (msg.error || msg.Error_Received) {
            const errorStr = JSON.stringify(msg.error || msg.Error_Received).toLowerCase();
            if (errorStr.includes('unsupported') || errorStr.includes('not found')) {
              this.log('WebSocket: Subscriptions not supported by provider', 'warn');
              this.handleWebSocketFailure('unsupported');
              resolve(false);
              return;
            }
          }
          
          // Handle events
          if (msg.params && msg.params.result) {
            this.wsLastEventTime = Date.now();
            this.handleEvent(msg.params.result, 'websocket');
          }
        } catch (e) {
          if (process.env.OPENCLAW_DEBUG === '1') {
            this.log(`WebSocket message parse error: ${e.message}`, 'debug');
          }
        }
      });

      this.ws.on('error', (err) => {
        if (!connected) {
          clearTimeout(connectionTimeout);
          this.log(`WebSocket error: ${err.message}`, 'error');
          this.handleWebSocketFailure('error');
          resolve(false);
        }
      });

      this.ws.on('close', () => {
        this.wsIsConnected = false;
        if (this.currentMode === 'websocket' && !this.isShuttingDown) {
          this.log('WebSocket disconnected unexpectedly', 'warn');
          this.handleWebSocketFailure('disconnected');
        }
      });
    });
  }

  handleWebSocketFailure(reason) {
    this.wsIsConnected = false;
    this.wsReconnectAttempts++;
    this.lastWsFailureTime = Date.now();
    
    if (this.forcedMode === 'websocket') {
      // In forced WebSocket mode, keep retrying
      if (this.wsReconnectAttempts < this.maxWsReconnectAttempts) {
        const delay = Math.min(30000, 2000 * Math.pow(2, this.wsReconnectAttempts));
        this.log(`WebSocket retry ${this.wsReconnectAttempts}/${this.maxWsReconnectAttempts} in ${delay}ms...`);
        setTimeout(() => this.tryWebSocket(), delay);
      } else {
        this.log('Max WebSocket reconnection attempts reached', 'error');
        process.exit(1);
      }
    } else {
      // In auto mode, fallback to polling
      this.log(`WebSocket failed (${reason}), switching to polling mode`);
      this.stopWebSocket();
      this.startPolling();
    }
  }

  stopWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsIsConnected = false;
  }

  // Start HTTP polling
  async startPolling() {
    if (this.isShuttingDown) return;
    if (this.isPolling) return;
    
    this.currentMode = 'polling';
    this.isPolling = true;
    this.log('Starting HTTP polling mode...');
    this.log(`Poll interval: ${this.pollIntervalMs}ms`);

    // Get starting block
    try {
      const block = await this.provider.getBlock('latest');
      this.currentBlock = block.block_number;
      this.log(`Starting from block ${this.currentBlock}`);
    } catch (err) {
      this.log(`Failed to get starting block: ${err.message}. Retrying in 5s...`, 'error');
      this.isPolling = false;
      setTimeout(() => {
        if (!this.isShuttingDown && !this.isPolling) this.startPolling();
      }, 5000);
      return;
    }

    this.poll();
  }

  stopPolling() {
    this.isPolling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async poll() {
    if (!this.isPolling || this.isShuttingDown) return;
    
    try {
      const latestBlock = await this.provider.getBlock('latest');
      const latestNumber = latestBlock.block_number;
      
      if (latestNumber > this.currentBlock) {
        const endBlock = Math.min(latestNumber, this.currentBlock + MAX_BLOCKS_PER_CYCLE);
        for (let blockNum = this.currentBlock + 1; blockNum <= endBlock; blockNum++) {
          await this.checkBlock(blockNum);
        }
        this.currentBlock = endBlock;
        if (latestNumber > endBlock) {
          this.log(`Polling backlog: processed to block ${endBlock}, latest is ${latestNumber}`);
        }
      }
    } catch (err) {
      this.log(`Poll error: ${err.message}`, 'error');
    }
    
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  async checkBlock(blockNumber) {
    try {
      const keys = this.eventNames.length > 0 
        ? this.eventNames.map(name => hash.getSelectorFromName(name))
        : undefined;

      let continuationToken = undefined;
      do {
        const events = await this.provider.getEvents({
          fromBlock: { block_number: blockNumber },
          toBlock: { block_number: blockNumber },
          address: this.contractAddress,
          keys: keys ? [keys] : undefined,
          chunk_size: 100,
          continuation_token: continuationToken
        });

        for (const event of events.events || []) {
          this.handleEvent(event, 'polling');
        }

        continuationToken = events.continuation_token;
      } while (continuationToken);
    } catch (err) {
      this.log(`Block ${blockNumber} error: ${err.message}`, 'error');
    }
  }

  // Handle events from either source
  handleEvent(event, source) {
    const keys = Array.isArray(event?.keys) ? event.keys : [];
    const txKey = `${event.transaction_hash || event.transactionHash}_${keys.join('_')}`;
    if (this.processedTxs.has(txKey)) return;
    this.processedTxs.add(txKey);
    
    if (this.processedTxs.size > 10000) {
      const entriesToRemove = this.processedTxs.size - 9000;
      let removed = 0;
      for (const key of this.processedTxs.keys()) {
        if (removed >= entriesToRemove) break;
        this.processedTxs.delete(key);
        removed++;
      }
    }

    const selector = keys[0];
    const eventData = {
      type: 'event',
      source,
      timestamp: new Date().toISOString(),
      blockNumber: event.block_number || event.blockNumber,
      transactionHash: event.transaction_hash || event.transactionHash,
      contractAddress: event.from_address || event.contractAddress,
      keys,
      data: event.data,
      eventName: this.getEventName(selector),
      selector
    };
    
    logEvent(eventData);
    
    if (this.webhookUrl) {
      sendWebhook(this.webhookUrl, eventData, this.webhookTimeoutMs).catch(() => {});
    }
  }

  getEventName(selector) {
    for (const name of this.eventNames) {
      if (hash.getSelectorFromName(name) === selector) return name;
    }
    return 'unknown';
  }

  // Health check - monitor both modes and recover if needed
  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      if (this.isShuttingDown) return;
      
      if (this.currentMode === 'websocket') {
        // Check if WebSocket is still healthy
        if (!this.wsIsConnected) {
          this.log('Health check: WebSocket not connected', 'warn');
          this.handleWebSocketFailure('health_check');
        }
        // Could also check last event time and fallback if no events for too long
      } else if (this.currentMode === 'polling') {
        // In auto mode, periodically try to recover WebSocket
        if (this.forcedMode !== 'auto') return;

        if (this.lastWsFailureTime && (Date.now() - this.lastWsFailureTime) >= this.wsRecoveryCooldownMs) {
          this.wsReconnectAttempts = 0;
          this.lastWsFailureTime = null;
        }

        if (this.wsReconnectAttempts >= 3) {
          return;
        }

        this.log('Health check: Attempting WebSocket recovery...');
        this.wsReconnectAttempts = 0;
        this.tryWebSocket().then(success => {
          if (success) {
            // Stop polling only after WebSocket is confirmed live
            this.stopPolling();
          }
        });
      }
    }, this.healthCheckIntervalMs);
  }

  stop() {
    this.isShuttingDown = true;
    this.log('Shutting down...');
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.stopWebSocket();
    this.stopPolling();
    
    process.exit(0);
  }
}

// Main
async function main() {
  const cliArg = process.argv[2];
  
  if (!cliArg) {
    console.error(JSON.stringify({
      error: 'No input provided',
      usage: 'node watch-events-smart.js \'{ "contractAddress": "0x...", "eventNames": ["Swapped"] }\''
    }));
    process.exit(1);
  }

  let config;
  let configPath = null;
  let webhookUrl = null;

  if (cliArg.startsWith('@')) {
    configPath = cliArg.slice(1);
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(JSON.stringify({ error: `Invalid JSON in config file ${configPath}: ${err.message}` }));
      process.exit(1);
    }
    if (!isPlainObject(config)) {
      console.error(JSON.stringify({ error: `Invalid JSON in config file ${configPath}: expected a non-null object` }));
      process.exit(1);
    }
    // File-backed cron configs must not supply the webhook URL; use WEBHOOK_URL
    // (exported by the cron wrapper) so file bytes never reach fetch().
    webhookUrl = sanitizeWebhookUrl(process.env.WEBHOOK_URL);
    if (typeof config.webhookUrl === 'string' && config.webhookUrl.length > 0) {
      if (webhookUrl) {
        log('config file webhookUrl is ignored; using WEBHOOK_URL from the environment', 'warn');
      } else {
        log('config file webhookUrl is ignored and WEBHOOK_URL is unset; webhook delivery disabled. Export WEBHOOK_URL in the cron wrapper (new jobs do this automatically)', 'warn');
      }
    }
  } else {
    let argvConfig;
    try {
      argvConfig = JSON.parse(cliArg);
    } catch (err) {
      console.error(JSON.stringify({ error: `Invalid JSON in input argument: ${err.message}` }));
      process.exit(1);
    }
    if (!isPlainObject(argvConfig)) {
      console.error(JSON.stringify({ error: 'Invalid JSON in input argument: expected a non-null object' }));
      process.exit(1);
    }
    config = argvConfig;
    if (Object.prototype.hasOwnProperty.call(argvConfig, 'webhookUrl')) {
      const rawWebhookUrl = argvConfig.webhookUrl;
      if (rawWebhookUrl === undefined || rawWebhookUrl === null || rawWebhookUrl === '') {
        webhookUrl = null;
      } else {
        webhookUrl = sanitizeWebhookUrl(rawWebhookUrl);
        if (!webhookUrl) {
          console.error(JSON.stringify({ error: 'Invalid webhookUrl in input argument' }));
          process.exit(1);
        }
      }
    } else {
      webhookUrl = sanitizeWebhookUrl(process.env.WEBHOOK_URL);
    }
  }

  const parsedEventNames = parseConfiguredEventNames(config.eventNames);
  if (!parsedEventNames.ok) {
    console.error(JSON.stringify({ error: parsedEventNames.error }));
    process.exit(1);
  }
  config.eventNames = parsedEventNames.names;

  // Remember config path/job name when started from cron
  if (configPath) {
    config.__configPath = configPath;
    config.__jobName = basename(configPath).replace(/\.json$/i, '');
  }
  
  if (!config.contractAddress) {
    console.error(JSON.stringify({ error: 'Missing "contractAddress"' }));
    process.exit(1);
  }

  if (config.schedule?.enabled) {
    const result = createCronJob({ ...config, webhookUrl });
    if (result.success) {
      console.log(JSON.stringify({
        type: 'cron-scheduled',
        jobName: result.jobName,
        configPath: result.configPath,
        logPath: result.logPath,
        message: `Cron job created. Will auto-detect best method on run.`
      }, null, 2));
      process.exit(0);
    } else {
      console.error(JSON.stringify({
        error: 'Failed to create cron job',
        details: result.error
      }));
      process.exit(1);
    }
  }
  
  let watcher;
  try {
    watcher = new SmartEventWatcher(config, webhookUrl);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }
  
  process.on('SIGINT', () => watcher.stop());
  process.on('SIGTERM', () => watcher.stop());
  
  await watcher.start();
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
