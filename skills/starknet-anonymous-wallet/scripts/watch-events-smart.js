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
 *   "webhookUrl": "http://localhost:3000/webhook", // optional
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
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join, basename } from 'path';

import { resolveRpcUrl } from './_rpc.js';

const DEFAULT_POLL_INTERVAL = 3000;
const DEFAULT_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const DEFAULT_WEBHOOK_TIMEOUT_MS = 5000;
const MAX_BLOCKS_PER_CYCLE = 200;
const DEFAULT_WS_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

let currentMode = 'initializing'; // 'websocket', 'polling', 'initializing'
let isShuttingDown = false;

function log(message, type = 'info') {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    mode: currentMode,
    message
  }));
}

function logEvent(eventData) {
  console.log(JSON.stringify(eventData));
}

async function sendWebhook(webhookUrl, data, timeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS) {
  if (!webhookUrl) return;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
  
  // If duration was specified, add it to execConfig so the watcher knows when to self-destruct
  if (scheduleInfo?.durationMs) {
    execConfig.durationMs = scheduleInfo.durationMs;
  }
  
  writeFileSync(configPath, JSON.stringify(execConfig, null, 2));

  const scriptPath = new URL(import.meta.url).pathname;
  
  const shellScript = `#!/bin/bash
cd "$(dirname "$0")"
exec node "${scriptPath}" '@${configPath}'
`;
  const shellPath = join(cronDir, `${jobName}.sh`);
  writeFileSync(shellPath, shellScript, { mode: 0o755 });

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
    const tmpCrontab = join(tmpdir(), `crontab-${process.pid}.tmp`);
    writeFileSync(tmpCrontab, newCrontab);
    execFileSync('crontab', [tmpCrontab]);
    try { unlinkSync(tmpCrontab); } catch (e) { log(`Failed to remove temp crontab (${tmpCrontab}): ${e}`, 'warn'); }

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

// Unified Event Watcher with mode switching
class SmartEventWatcher {
  constructor(config) {
    this.config = config;
    const rpcUrl = config.httpRpcUrl || resolveRpcUrl();
    this.httpUrl = rpcUrl;
    // Derive WebSocket URL from HTTP URL if not explicitly provided
    this.wsUrl = config.wsRpcUrl || this.httpUrl.replace(/^https?:\/\//, (m) => m.startsWith('https') ? 'wss://' : 'ws://').replace(/\/?$/, '/ws');
    this.pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL;
    this.healthCheckIntervalMs = config.healthCheckIntervalMs || DEFAULT_HEALTH_CHECK_INTERVAL;
    this.webhookTimeoutMs = config.webhookTimeoutMs || DEFAULT_WEBHOOK_TIMEOUT_MS;
    this.webhookUrl = config.webhookUrl || null;
    this.contractAddress = config.contractAddress;
    this.eventNames = config.eventNames || [];
    this.forcedMode = config.mode || 'auto'; // 'auto', 'websocket', 'polling'
    
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

  async start() {
    log('Starting smart event watcher...');
    log(`Contract: ${this.contractAddress}`);
    log(`Events: ${this.eventNames.join(', ')}`);
    log(`Mode preference: ${this.forcedMode}`);
    
    if (this.durationMs) {
      log(`Duration: ${this.durationMs}ms (${this.durationMs / 1000 / 60} minutes)`);
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
        log(`TTL expired after ${this.durationMs}ms. Self-destructing...`, 'info');
        this.selfDestruct();
      } else {
        const currentMinute = Math.ceil(remaining / 1000 / 60);
        if (currentMinute !== this.lastLoggedMinute) {
          this.lastLoggedMinute = currentMinute;
          log(`TTL: ${currentMinute} minutes remaining`, 'info');
        }
      }
    }, 1000); // Check every second
  }
  
  // Self-destruct: stop watching and remove cron job
  async selfDestruct() {
    log('Executing self-destruct sequence...', 'info');
    
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
        const tmpCrontab = join(tmpdir(), `crontab-${process.pid}.tmp`);
        writeFileSync(tmpCrontab, newCrontab);
        execFileSync('crontab', [tmpCrontab]);
        try { unlinkSync(tmpCrontab); } catch (e) { log(`Failed to remove temp crontab (${tmpCrontab}): ${e}`, 'warn'); }

        // Delete files
        try { unlinkSync(shellPath); } catch (e) { log(`Failed to remove shellPath (${shellPath}): ${e}`, 'warn'); }
        try { unlinkSync(configPath); } catch (e) { log(`Failed to remove configPath (${configPath}): ${e}`, 'warn'); }

        log(`Removed cron job: ${jobName}`, 'info');
        removed = true;
      }

      // Fallback: scan cron dir for a shell script that references our config path
      if (!removed && knownConfigPath) {
        const files = readdirSync(cronDir);
        for (const file of files) {
          if (!file.endsWith('.sh')) continue;
          const shellPath = join(cronDir, file);
          const content = readFileSync(shellPath, 'utf8');
          if (content.includes(knownConfigPath)) {
            const currentCrontab = execSync('crontab -l 2>/dev/null || echo ""').toString();
            const lines = currentCrontab.split('\n').filter(line => !line.includes(shellPath));
            const newCrontab = lines.join('\n') + '\n';
            const tmpCrontab = join(tmpdir(), `crontab-${process.pid}-2.tmp`);
            writeFileSync(tmpCrontab, newCrontab);
            execFileSync('crontab', [tmpCrontab]);
            try { unlinkSync(tmpCrontab); } catch (e) { log(`Failed to remove temp crontab (${tmpCrontab}): ${e}`, 'warn'); }

            try { unlinkSync(shellPath); } catch (e) { log(`Failed to remove shellPath (${shellPath}): ${e}`, 'warn'); }
            const derivedConfigPath = shellPath.replace(/\.sh$/i, '.json');
            try { unlinkSync(derivedConfigPath); } catch (e) { log(`Failed to remove configPath (${derivedConfigPath}): ${e}`, 'warn'); }

            log(`Removed cron job: ${file}`, 'info');
            removed = true;
            break;
          }
        }
      }

      if (!removed) {
        log('No cron job found to remove (may have been manual run)', 'warn');
      }
    } catch (err) {
      log(`Error during self-destruct cleanup: ${err.message}`, 'error');
    }
    
    log('Self-destruct complete. Exiting.', 'info');
    process.exit(0);
  }

  // Try to connect via WebSocket
  async tryWebSocket() {
    if (isShuttingDown) return;
    
    currentMode = 'websocket';
    log('Attempting WebSocket connection...');

    return new Promise((resolve) => {
      let connected = false;
      
      this.ws = new WebSocket(this.wsUrl);
      
      const connectionTimeout = setTimeout(() => {
        if (!connected) {
          log('WebSocket connection timeout', 'warn');
          this.ws.close();
          this.handleWebSocketFailure('timeout');
          resolve(false);
        }
      }, 10000);

      this.ws.on('open', () => {
        connected = true;
        clearTimeout(connectionTimeout);
        this.wsIsConnected = true;
        this.wsReconnectAttempts = 0;
        log('WebSocket connected successfully');
        
        // Subscribe to events
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
        
        resolve(true);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          
          // Handle subscription confirmation
          if (msg.result !== undefined && typeof msg.result === 'number') {
            log(`Subscribed with ID: ${msg.result}`);
            return;
          }
          
          // Handle error (unsupported method)
          if (msg.error || msg.Error_Received) {
            const errorStr = JSON.stringify(msg.error || msg.Error_Received).toLowerCase();
            if (errorStr.includes('unsupported') || errorStr.includes('not found')) {
              log('WebSocket: Subscriptions not supported by provider', 'warn');
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
          // Ignore parse errors
        }
      });

      this.ws.on('error', (err) => {
        if (!connected) {
          clearTimeout(connectionTimeout);
          log(`WebSocket error: ${err.message}`, 'error');
          this.handleWebSocketFailure('error');
          resolve(false);
        }
      });

      this.ws.on('close', () => {
        this.wsIsConnected = false;
        if (currentMode === 'websocket' && !isShuttingDown) {
          log('WebSocket disconnected unexpectedly', 'warn');
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
        log(`WebSocket retry ${this.wsReconnectAttempts}/${this.maxWsReconnectAttempts} in ${delay}ms...`);
        setTimeout(() => this.tryWebSocket(), delay);
      } else {
        log('Max WebSocket reconnection attempts reached', 'error');
        process.exit(1);
      }
    } else {
      // In auto mode, fallback to polling
      log(`WebSocket failed (${reason}), switching to polling mode`);
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
    if (isShuttingDown) return;
    if (this.isPolling) return;
    
    currentMode = 'polling';
    this.isPolling = true;
    log('Starting HTTP polling mode...');
    log(`Poll interval: ${this.pollIntervalMs}ms`);

    // Get starting block
    try {
      const block = await this.provider.getBlock('latest');
      this.currentBlock = block.block_number;
      log(`Starting from block ${this.currentBlock}`);
    } catch (err) {
      log(`Failed to get starting block: ${err.message}`, 'error');
      this.currentBlock = 0;
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
    if (!this.isPolling || isShuttingDown) return;
    
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
          log(`Polling backlog: processed to block ${endBlock}, latest is ${latestNumber}`);
        }
      }
    } catch (err) {
      log(`Poll error: ${err.message}`, 'error');
    }
    
    this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
  }

  async checkBlock(blockNumber) {
    try {
      const keys = this.eventNames.length > 0 
        ? this.eventNames.map(name => hash.getSelectorFromName(name))
        : undefined;
      
      const events = await this.provider.getEvents({
        fromBlock: { block_number: blockNumber },
        toBlock: { block_number: blockNumber },
        address: this.contractAddress,
        keys: keys ? [keys] : undefined,
        chunk_size: 100
      });
      
      for (const event of events.events || []) {
        this.handleEvent(event, 'polling');
      }
    } catch (err) {
      log(`Block ${blockNumber} error: ${err.message}`, 'error');
    }
  }

  // Handle events from either source
  handleEvent(event, source) {
    const txKey = `${event.transaction_hash || event.transactionHash}_${event.keys.join('_')}`;
    if (this.processedTxs.has(txKey)) return;
    this.processedTxs.add(txKey);
    
    if (this.processedTxs.size > 10000) {
      const iter = this.processedTxs.values();
      this.processedTxs.delete(iter.next().value);
    }

    const eventData = {
      type: 'event',
      source,
      timestamp: new Date().toISOString(),
      blockNumber: event.block_number || event.blockNumber,
      transactionHash: event.transaction_hash || event.transactionHash,
      contractAddress: event.from_address || event.contractAddress,
      keys: event.keys,
      data: event.data,
      eventName: this.getEventName(event.keys[0])
    };
    
    logEvent(eventData);
    
    if (this.webhookUrl) {
      sendWebhook(this.webhookUrl, eventData, this.webhookTimeoutMs);
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
      if (isShuttingDown) return;
      
      if (currentMode === 'websocket') {
        // Check if WebSocket is still healthy
        if (!this.wsIsConnected) {
          log('Health check: WebSocket not connected', 'warn');
          this.handleWebSocketFailure('health_check');
        }
        // Could also check last event time and fallback if no events for too long
      } else if (currentMode === 'polling') {
        // In auto mode, periodically try to recover WebSocket
        if (this.forcedMode !== 'auto') return;

        if (this.lastWsFailureTime && (Date.now() - this.lastWsFailureTime) >= this.wsRecoveryCooldownMs) {
          this.wsReconnectAttempts = 0;
          this.lastWsFailureTime = null;
        }

        if (this.wsReconnectAttempts >= 3) {
          return;
        }

        log('Health check: Attempting WebSocket recovery...');
        this.wsReconnectAttempts = 0;
        this.stopPolling();
        this.tryWebSocket().then(success => {
          if (!success) {
            // Recovery failed, continue polling
            this.startPolling();
          }
        });
      }
    }, this.healthCheckIntervalMs);
  }

  stop() {
    isShuttingDown = true;
    log('Shutting down...');
    
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
  let rawInput = process.argv[2];
  
  if (!rawInput) {
    console.error(JSON.stringify({
      error: 'No input provided',
      usage: 'node watch-events-smart.js \'{ "contractAddress": "0x...", "eventNames": ["Swapped"] }\''
    }));
    process.exit(1);
  }

  let configPath = null;
  if (rawInput.startsWith('@')) {
    configPath = rawInput.slice(1);
    rawInput = readFileSync(configPath, 'utf8');
  }
  
  const config = JSON.parse(rawInput);
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
    const result = createCronJob(config);
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
  
  const watcher = new SmartEventWatcher(config);
  
  process.on('SIGINT', () => watcher.stop());
  process.on('SIGTERM', () => watcher.stop());
  
  await watcher.start();
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
