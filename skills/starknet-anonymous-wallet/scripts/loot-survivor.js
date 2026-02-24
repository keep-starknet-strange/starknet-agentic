#!/usr/bin/env node
/**
 * loot-survivor.js (Provable Games / Death Mountain)
 *
 * Purpose: minimal, explicit contract interactions to "play" Loot Survivor from this skill.
 * - Reads game state (view)
 * - Sends txs for: start_game / explore / attack / flee
 * - Optionally mints a new game token (adventurer_id) via Game Token contract
 *
 * IMPORTANT:
 * - This script is intentionally NOT wired into resolve-smart natural language parsing yet.
 * - It is designed to be called by resolve-smart (or directly) with explicit JSON.
 * - All addresses below come from https://docs.provable.games/lootsurvivor/contracts (Mainnet).
 *
 * Usage examples:
 *   node scripts/loot-survivor.js '{"mode":"state","adventurerId":123}'
 *   node scripts/loot-survivor.js '{"mode":"start_game","adventurerId":123,"weapon":0, "privateKey":"0x..","accountAddress":"0x.."}'
 *
 * If privateKey/accountAddress are omitted for write modes, PRIVATE_KEY env can be used
 * and accountAddress must be provided.
 */

import { RpcProvider, Account, Contract, CallData, shortString, hash } from 'starknet';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resolveRpcUrl } from './_rpc.js';


// Loot Survivor (Death Mountain) mainnet addresses (docs)
const ADDRS = {
  GAME: '0x6f7c4350d6d5ee926b3ac4fa0c9c351055456e75c92227468d84232fc493a9c',
  GAME_TOKEN: '0x5e2dfbdc3c193de629e5beb116083b06bd944c1608c9c793351d5792ba29863'
};

// Local UX state: latest adventurer id per account
const LOOT_STATE_DIR = join(homedir(), '.openclaw', 'typhoon-loot-survivor');
const LOOT_STATE_FILE = join(LOOT_STATE_DIR, 'latest.json');
const LOOT_STATE_TMP_FILE = join(LOOT_STATE_DIR, 'latest.json.tmp');
const LOOT_STATE_LOCK_FILE = join(LOOT_STATE_DIR, '.latest.lock');
const LOCK_SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms) {
  Atomics.wait(LOCK_SLEEP_CELL, 0, 0, ms);
}

function withLootStateLock(fn) {
  mkdirSync(LOOT_STATE_DIR, { recursive: true });
  const deadlineMs = Date.now() + 1000;
  let lockFd = null;
  while (lockFd === null) {
    try {
      lockFd = openSync(LOOT_STATE_LOCK_FILE, 'wx');
    } catch (err) {
      if (err?.code !== 'EEXIST' || Date.now() >= deadlineMs) {
        throw err;
      }
      sleepSync(20);
    }
  }
  try {
    return fn();
  } finally {
    try { closeSync(lockFd); } catch {}
    try { unlinkSync(LOOT_STATE_LOCK_FILE); } catch {}
  }
}

function lootStateMutate(accountAddress, mutateEntry) {
  if (!accountAddress) return;
  try {
    withLootStateLock(() => {
      const map = lootStateLoad();
      const entry = lootStateGetEntry(map, accountAddress);
      mutateEntry(entry);
      lootStateWriteEntry(map, accountAddress, entry);
      writeFileSync(LOOT_STATE_TMP_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
      renameSync(LOOT_STATE_TMP_FILE, LOOT_STATE_FILE);
    });
  } catch {
    // best-effort
  }
}

function lootStateLoad() {
  try {
    if (!existsSync(LOOT_STATE_FILE)) return {};
    return JSON.parse(readFileSync(LOOT_STATE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function lootStateGetEntry(map, accountAddress) {
  const v = map[String(accountAddress).toLowerCase()];
  // Backward compat: older versions stored just the latest adventurerId as a string
  if (typeof v === 'string') return { latestAdventurerId: v, pendingEncounter: false };
  if (v && typeof v === 'object') {
    return {
      latestAdventurerId: v.latestAdventurerId ? String(v.latestAdventurerId) : null,
      pendingEncounter: Boolean(v.pendingEncounter)
    };
  }
  return { latestAdventurerId: null, pendingEncounter: false };
}

function lootStateWriteEntry(map, accountAddress, entry) {
  map[String(accountAddress).toLowerCase()] = {
    latestAdventurerId: entry.latestAdventurerId ? String(entry.latestAdventurerId) : null,
    pendingEncounter: Boolean(entry.pendingEncounter)
  };
}

function lootStateGetLatest(accountAddress) {
  if (!accountAddress) return null;
  const map = lootStateLoad();
  return lootStateGetEntry(map, accountAddress).latestAdventurerId;
}

function lootStateGetPending(accountAddress) {
  if (!accountAddress) return false;
  const map = lootStateLoad();
  return lootStateGetEntry(map, accountAddress).pendingEncounter;
}

function lootStateSetLatest(accountAddress, adventurerId) {
  if (accountAddress == null || adventurerId == null || adventurerId === '') return;
  lootStateMutate(accountAddress, (entry) => {
    entry.latestAdventurerId = String(adventurerId);
  });
}

function lootStateSetPending(accountAddress, pending) {
  if (!accountAddress) return;
  lootStateMutate(accountAddress, (entry) => {
    entry.pendingEncounter = Boolean(pending);
  });
}

function loadPersistedAdventurerId(accountAddress) {
  return lootStateGetLatest(accountAddress);
}

function savePersistedAdventurerId(accountAddress, adventurerId) {
  lootStateSetLatest(accountAddress, adventurerId);
}

function fail(message, extra = {}) {
  console.log(JSON.stringify({ success: false, error: message, ...extra }));
  process.exit(1);
}

function parseJsonArg() {
  const raw = process.argv[2];
  if (!raw) fail('No input provided. Expected JSON as argv[2].');
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON: ${e.message}`);
  }
}

async function abiAt(provider, address) {
  const cls = await provider.getClassAt(address);
  if (!cls?.abi) fail('Contract has no ABI on chain', { contractAddress: address });
  return cls.abi;
}

function toBool(v, def = false) {
  if (v === undefined || v === null) return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'y', 'on'].includes(v.toLowerCase());
  return def;
}

function toU64(v, name = 'value') {
  if (v === undefined || v === null) fail(`Missing ${name}`);
  const n = BigInt(v);
  if (n < 0n || n > (2n ** 64n - 1n)) fail(`${name} out of u64 range`, { [name]: String(v) });
  return n.toString();
}

function toU8(v, name = 'value') {
  if (v === undefined || v === null) fail(`Missing ${name}`);
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 255) fail(`${name} out of u8 range`, { [name]: v });
  return String(n);
}

function tryDecodeFeltToString(feltHex) {
  try {
    return shortString.decodeShortString(feltHex);
  } catch {
    return null;
  }
}

async function readGameState(provider, adventurerId) {
  const abi = await abiAt(provider, ADDRS.GAME);
  const contract = new Contract({
    abi,
    address: ADDRS.GAME,
    providerOrAccount: provider
  });
  const res = await contract.call('get_game_state', [toU64(adventurerId, 'adventurerId')]);
  return res;
}

async function invoke(account, contractAddress, method, args) {
  const abi = await abiAt(account.provider, contractAddress);
  const contract = new Contract({
    abi,
    address: contractAddress,
    providerOrAccount: account
  });
  const result = await contract.invoke(method, args, { waitForTransaction: true });
  return {
    txHash: result.transaction_hash,
    explorer: `https://voyager.online/tx/${result.transaction_hash}`,
    executionStatus: result.execution_status,
    finalityStatus: result.finality_status
  };
}

function deepFind(obj, keyNames, maxDepth = 6, depth = 0) {
  if (!obj || depth > maxDepth) return undefined;
  if (typeof obj !== 'object') return undefined;

  // direct match
  for (const k of Object.keys(obj)) {
    if (keyNames.includes(k)) return obj[k];
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = deepFind(v, keyNames, maxDepth, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function pickGameState(state) {
  // starknet.js can return struct-like objects or arrays depending on ABI/codec.
  if (!state) return null;
  if (state.beast || state.adventurer) return state;
  if (Array.isArray(state) && state.length > 0 && (state[0]?.beast || state[0]?.adventurer)) return state[0];
  return state;
}

function buildSummaryFromGameState(state) {
  const gs = pickGameState(state) || {};

  // Known GameState struct (Death Mountain): { adventurer, bag, beast, market }
  const adv = gs.adventurer || {};
  const beast = gs.beast || {};

  const summary = {};

  // Adventurer stats (best effort; names based on common structs)
  // If exact fields differ, fall back to deepFind.
  summary.hp = adv.health ?? deepFind(gs, ['health', 'hp', 'current_health', 'currentHealth']);
  summary.xp = adv.xp ?? deepFind(gs, ['xp', 'experience']);
  summary.gold = adv.gold ?? deepFind(gs, ['gold']);
  summary.level = adv.level ?? deepFind(gs, ['level']);

  // Beast stats from BeastEvent struct: { id:u8, seed:u64, health:u16, level:u16, specials, is_collectable }
  summary.beastId = beast.id ?? deepFind(gs, ['beast', 'id']);
  summary.beastHealth = beast.health ?? deepFind(gs, ['beast', 'health', 'beastHealth', 'beast_health']);
  summary.beastLevel = beast.level ?? deepFind(gs, ['beast', 'level', 'beastLevel', 'beast_level']);
  summary.beastCollectable = beast.is_collectable ?? deepFind(gs, ['beast', 'is_collectable', 'isCollectable']);

  // "inCombat" is not explicit in this struct; infer from beast health > 0
  summary.inCombat = (() => {
    const h = summary.beastHealth;
    if (h === undefined || h === null) return undefined;
    try { return BigInt(h) > 0n; } catch { return undefined; }
  })();

  return summary;
}

function isBeastEncounter(summary) {
  try {
    if (summary?.inCombat === true) return true;
    const bh = summary?.beastHealth;
    if (bh === undefined || bh === null) return false;
    return BigInt(bh) > 0n;
  } catch {
    return false;
  }
}

function extractBeastStats(postState) {
  const gs = pickGameState(postState) || {};
  const beast = gs.beast || {};
  return {
    id: beast.id,
    level: beast.level,
    health: beast.health,
    seed: beast.seed,
    isCollectable: beast.is_collectable,
    specials: beast.specials,
    raw: beast
  };
}

async function getReceipt(provider, txHash) {
  try {
    // starknet.js: getTransactionReceipt
    return await provider.getTransactionReceipt(txHash);
  } catch {
    return null;
  }
}

function tryExtractMintedAdventurerIdFromReceipt(receipt) {
  // Prefer ERC721 Transfer events and extract token id from event data.
  if (!receipt || !Array.isArray(receipt.events)) return null;
  const transferSelector = hash.getSelectorFromName('Transfer');
  const u64Max = 2n ** 64n - 1n;
  const transferCandidates = [];

  for (const ev of receipt.events) {
    const eventKey0 = Array.isArray(ev?.keys) ? String(ev.keys[0] || '') : '';
    if (!eventKey0 || eventKey0.toLowerCase() !== transferSelector.toLowerCase()) {
      continue;
    }

    const data = ev?.data || [];
    const preferredSlots = [];
    if (data.length >= 3) preferredSlots.push(data[2]); // common ERC721 tokenId slot
    if (data.length > 0) preferredSlots.push(data[data.length - 1]); // fallback to last slot

    for (const x of preferredSlots) {
      try {
        const b = BigInt(x);
        if (b >= 0n && b <= u64Max) return b.toString();
      } catch {}
    }

    for (const x of data) {
      try {
        const b = BigInt(x);
        if (b >= 0n && b <= u64Max) transferCandidates.push(b);
      } catch {}
    }
  }

  if (transferCandidates.length === 0) return null;
  transferCandidates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return transferCandidates[0].toString();
}

async function main() {
  const input = parseJsonArg();
  const rpcUrl = resolveRpcUrl();
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const mode = input.mode;
  if (!mode) {
    fail('Missing mode', { allowed: ['state', 'mint_game', 'start_game', 'explore', 'attack', 'flee'] });
  }

  if (mode === 'state') {
    let adventurerId = input.adventurerId;
    if ((adventurerId === undefined || adventurerId === null || adventurerId === '') && input.accountAddress) {
      adventurerId = loadPersistedAdventurerId(input.accountAddress);
    }
    if (adventurerId === undefined || adventurerId === null || adventurerId === '') {
      fail('Missing adventurerId and no latest adventurer stored yet. Start/mint once or provide adventurerId.');
    }
    const state = await readGameState(provider, adventurerId);
    // Persist best-effort
    if (input.accountAddress) savePersistedAdventurerId(input.accountAddress, adventurerId);
    console.log(JSON.stringify({ success: true, mode, adventurerId, state }, null, 2));
    return;
  }

  // Write modes need account
  const privateKey = input.privateKey || process.env.PRIVATE_KEY;
  const accountAddress = input.accountAddress;
  if (!privateKey) fail('Missing privateKey (or PRIVATE_KEY env) for write mode');
  if (!accountAddress) fail('Missing accountAddress for write mode');

  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey
  });

  if (mode === 'mint_game') {
    // Minimal mint_game:
    // mint_game(player_name: Option<felt252>, settings_id: Option<u32>, start/end/objective_ids/context/client_url/renderer_address: Option<...>, to: ContractAddress, soulbound: bool)
    // We pass most Options as None.

    const soulbound = toBool(input.soulbound, true);
    const name = input.playerName ? shortString.encodeShortString(String(input.playerName).slice(0, 31)) : null;

    // Build Cairo Option encoding using starknet.js CallData:
    // For Option<T>: { is_some: 0|1, value?: T }
    const args = {
      player_name: name ? { is_some: 1, value: name } : { is_some: 0 },
      settings_id: { is_some: 0 },
      start: { is_some: 0 },
      end: { is_some: 0 },
      objective_ids: { is_some: 0 },
      context: { is_some: 0 },
      client_url: { is_some: 0 },
      renderer_address: { is_some: 0 },
      to: accountAddress,
      soulbound
    };

    const abi = await abiAt(provider, ADDRS.GAME_TOKEN);
    const contract = new Contract({
      abi,
      address: ADDRS.GAME_TOKEN,
      providerOrAccount: account
    });

    // Try invoke with object args first; if it fails, compile calldata and retry.
    let tx;
    try {
      const res = await contract.invoke('mint_game', args, { waitForTransaction: true });
      tx = res.transaction_hash;
    } catch (e) {
      try {
        const calldataBuilder = new CallData(contract.abi);
        const calldata = calldataBuilder.compile('mint_game', args);
        const res2 = await contract.invoke('mint_game', calldata, { waitForTransaction: true });
        tx = res2.transaction_hash;
      } catch (e2) {
        fail('mint_game invoke failed', { details: e2.message || String(e2) });
      }
    }

    const receipt = await getReceipt(provider, tx);
    const minted = tryExtractMintedAdventurerIdFromReceipt(receipt);
    if (minted) {
      savePersistedAdventurerId(accountAddress, minted);
    }
    console.log(JSON.stringify({
      success: true,
      mode,
      contractAddress: ADDRS.GAME_TOKEN,
      txHash: tx,
      explorer: `https://voyager.online/tx/${tx}`,
      guessedAdventurerId: minted,
      note: minted ? 'guessedAdventurerId is a heuristic from receipt events; verify via UI/state reads.' : 'Could not infer adventurer id from receipt.'
    }, null, 2));
    return;
  }

  // Other write modes: Game contract
  const ensuredAdventurerId = (v) => {
    let id = v;
    if ((id === undefined || id === null || id === '') && accountAddress) {
      id = loadPersistedAdventurerId(accountAddress);
    }
    if (id === undefined || id === null || id === '') {
      fail('Missing adventurerId and no latest adventurer stored yet. Start/mint once or provide adventurerId.');
    }
    // Persist intent
    if (accountAddress) savePersistedAdventurerId(accountAddress, id);
    return id;
  };

  const runEncounterMode = async ({
    modeName,
    entrypoint,
    optionField,
    optionValue,
    choicePrompt
  }) => {
    const adventurerId = ensuredAdventurerId(input.adventurerId);
    const tx = await invoke(account, ADDRS.GAME, entrypoint, [
      toU64(adventurerId, 'adventurerId'),
      optionValue ? '1' : '0'
    ]);
    if (accountAddress) savePersistedAdventurerId(accountAddress, adventurerId);

    const postState = await readGameState(provider, adventurerId);
    const summary = buildSummaryFromGameState(postState);
    const inEncounter = isBeastEncounter(summary);
    if (accountAddress) lootStateSetPending(accountAddress, inEncounter);

    const out = {
      success: true,
      mode: modeName,
      adventurerId,
      [optionField]: optionValue,
      ...tx,
      postState,
      summary
    };
    if (inEncounter) {
      out.nextStep = 'USER_CHOICE';
      out.choices = ['attack', 'flee'];
      out.choicePrompt = choicePrompt;
      out.beastStats = extractBeastStats(postState);
    }
    console.log(JSON.stringify(out, null, 2));
  };

  if (mode === 'start_game') {
    const adventurerId = ensuredAdventurerId(input.adventurerId);
    const weapon = input.weapon ?? 0;
    const tx = await invoke(account, ADDRS.GAME, 'start_game', [toU64(adventurerId, 'adventurerId'), toU8(weapon, 'weapon')]);
    if (accountAddress) {
      savePersistedAdventurerId(accountAddress, adventurerId);
      lootStateSetPending(accountAddress, false);
    }

    const postState = await readGameState(provider, adventurerId);
    const summary = buildSummaryFromGameState(postState);

    console.log(JSON.stringify({ success: true, mode, adventurerId, weapon: Number(weapon), ...tx, postState, summary }, null, 2));
    return;
  }

  if (mode === 'explore') {
    const tillBeast = toBool(input.tillBeast, false);
    await runEncounterMode({
      modeName: mode,
      entrypoint: 'explore',
      optionField: 'tillBeast',
      optionValue: tillBeast,
      choicePrompt: 'Beast encountered. Do you want to attack or flee?'
    });
    return;
  }

  if (mode === 'attack') {
    const toTheDeath = toBool(input.toTheDeath, false);
    await runEncounterMode({
      modeName: mode,
      entrypoint: 'attack',
      optionField: 'toTheDeath',
      optionValue: toTheDeath,
      choicePrompt: 'Combat continues. Do you want to attack again or flee?'
    });
    return;
  }

  if (mode === 'flee') {
    const toTheDeath = toBool(input.toTheDeath, false);
    await runEncounterMode({
      modeName: mode,
      entrypoint: 'flee',
      optionField: 'toTheDeath',
      optionValue: toTheDeath,
      choicePrompt: 'You are still in combat. Do you want to attack or flee?'
    });
    return;
  }

  fail('Unknown mode', { mode });
}

main().catch((e) => fail(e.message || String(e)));
