#!/usr/bin/env node
/**
 * vesu-pool.js
 * High-level Vesu helper that maps user intents (supply/borrow) to the Pool.modify_position call.
 *
 * Input JSON (example):
 * {
 *   "action": "supply" | "borrow",
 *   "pool": "Vesu Main Pool",
 *   "user": "0x..." (optional; defaults to accountAddress),
 *   "collateralToken": "STRK",
 *   "collateralAmount": "1000.0",
 *   "debtToken": "USDC",
 *   "debtAmount": "100.0",
 *   "accountAddress": "0x...",
 *   "rpcUrl": "https://..." (optional)
 * }
 */

import { Provider, Contract } from 'starknet';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { resolveRpcUrl } from './_rpc.js';
import { fetchVerifiedTokens } from './_tokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_ROOT = join(__dirname, '..');

function isHexAddress(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v);
}

function loadVesuPools() {
  // Pools are stored under protocols.json → VESU.pools
  const p = join(SKILL_ROOT, 'protocols.json');
  if (!existsSync(p)) return {};
  try {
    const all = JSON.parse(readFileSync(p, 'utf8'));
    return all?.VESU?.pools || {};
  } catch {
    return {};
  }
}

// Safe decimal parsing (same rules as resolve-smart)
function parseAmountToBaseUnits(amount, decimals) {
  const dec = Number(decimals ?? 18);
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  if (amount === null || amount === undefined) throw new Error('Missing amount');

  let s;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new Error('Amount must be finite');
    s = String(amount);
    if (/[eE]/.test(s)) throw new Error('Scientific notation not supported; pass as string');
  } else {
    s = String(amount).trim();
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) throw new Error(`Invalid amount format: ${s}`);

  const [intPart, fracRaw = ''] = s.split('.');
  if (fracRaw.length > dec) {
    throw new Error(`Too many decimal places: got ${fracRaw.length}, token supports ${dec}`);
  }

  const base = 10n ** BigInt(dec);
  const intBI = BigInt(intPart || '0');
  const fracPadded = (fracRaw + '0'.repeat(dec)).slice(0, dec);
  const fracBI = BigInt(fracPadded || '0');
  return intBI * base + fracBI;
}

function toUint256(n) {
  const low = (n & ((1n << 128n) - 1n));
  const high = (n >> 128n);
  return { low: low.toString(), high: high.toString() };
}

function u256ToBigInt(v) {
  if (v === null || v === undefined) return 0n;
  // starknet.js may return {low, high} or [low, high] or nested under .value
  if (typeof v === 'object') {
    if (Array.isArray(v) && v.length >= 2) {
      return BigInt(String(v[0])) + (BigInt(String(v[1])) << 128n);
    }
    if ('low' in v && 'high' in v) {
      return BigInt(String(v.low)) + (BigInt(String(v.high)) << 128n);
    }
  }
  // fallback single felt
  return BigInt(String(v));
}

function formatUnits(value, decimals) {
  const d = Number(decimals ?? 18);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(d);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(d, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fracStr ? `.${fracStr}` : ''}`;
}

async function resolveToken(symbol) {
  const tokens = await fetchVerifiedTokens();
  const t = tokens.find(x => x.symbol?.toLowerCase() === String(symbol || '').toLowerCase());
  if (!t?.address) return null;
  return { symbol: t.symbol, address: t.address, decimals: Number(t.decimals ?? 18) };
}


async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.log(JSON.stringify({ success: false, error: 'No input provided' }));
    process.exit(1);
  }

  let input;
  try { input = JSON.parse(raw); } catch (e) {
    console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${e.message}` }));
    process.exit(1);
  }

  const action = String(input.action || '').toLowerCase();
  const poolName = input.pool || input.poolName;
  const accountAddress = input.accountAddress;
  const user = input.user || accountAddress;
  const rpcUrl = resolveRpcUrl();

  if (!['supply', 'borrow', 'position', 'stats'].includes(action)) {
    console.log(JSON.stringify({ success: false, error: 'Unsupported action (expected supply|borrow|position|stats)' }));
    process.exit(1);
  }

  const normalizedAction = action === 'stats' ? 'position' : action;
  if (!poolName) {
    console.log(JSON.stringify({ success: false, error: 'Missing pool name (pool)' }));
    process.exit(1);
  }
  if (!isHexAddress(accountAddress)) {
    console.log(JSON.stringify({ success: false, error: 'Missing/invalid accountAddress' }));
    process.exit(1);
  }
  if (!isHexAddress(user)) {
    console.log(JSON.stringify({ success: false, error: 'Missing/invalid user address' }));
    process.exit(1);
  }

  const pools = loadVesuPools();
  const poolCfg = pools[poolName];
  if (!poolCfg?.poolAddress || !isHexAddress(poolCfg.poolAddress)) {
    console.log(JSON.stringify({
      success: false,
      error: `Unknown/unconfigured pool: ${poolName}`,
      nextStep: 'CONFIGURE_VESU_POOL',
      message: 'Add this pool to vesu-pools.json with a verified poolAddress.'
    }));
    process.exit(1);
  }

  const supportedCollaterals = Array.isArray(poolCfg.supportedCollateralSymbols)
    ? poolCfg.supportedCollateralSymbols.map(s => String(s).toUpperCase())
    : null;

  const poolAddress = poolCfg.poolAddress;

  const provider = new Provider({ nodeUrl: rpcUrl });

  // Resolve tokens
  // For Vesu modify_position we need collateral_asset + debt_asset.
  // For supply-only, debt_asset is still required by the protocol; use configured defaultDebtAssetSymbol.
  const collateralToken = input.collateralToken || input.token;
  const debtToken = input.debtToken;

  if (supportedCollaterals && collateralToken) {
    const sym = String(collateralToken).toUpperCase();
    if (!supportedCollaterals.includes(sym)) {
      console.log(JSON.stringify({
        success: false,
        error: `Collateral ${sym} not supported by pool ${poolName}`,
        nextStep: 'CHOOSE_COLLATERAL',
        supportedCollateralSymbols: supportedCollaterals
      }));
      process.exit(1);
    }
  }

  if (normalizedAction === 'position') {
    // Position stats require pair identification.
    const collSym = input.collateralToken || input.collateralAsset || input.token || input.collateral;
    const debtSym = input.debtToken || input.debtAsset || input.debt;
    if (!collSym || !debtSym) {
      console.log(JSON.stringify({
        success: true,
        canProceed: false,
        nextStep: 'MISSING_FIELDS',
        operationType: 'PROMPT_INCOMPLETE',
        missing: [
          ...(collSym ? [] : ['collateralToken']),
          ...(debtSym ? [] : ['debtToken'])
        ],
        message: 'To show your Vesu position stats, specify the collateral and debt assets (e.g. STRK/USDC).'
      }));
      return;
    }

    const collateralInfo = await resolveToken(collSym);
    const debtInfo = await resolveToken(debtSym);
    if (!collateralInfo || !debtInfo) {
      console.log(JSON.stringify({
        success: false,
        error: `Unknown token(s): ${!collateralInfo ? collSym : ''}${(!collateralInfo && !debtInfo) ? ', ' : ''}${!debtInfo ? debtSym : ''}`,
        nextStep: 'CHOOSE_TOKEN'
      }));
      process.exit(1);
    }

    // Pool.position(collateral_asset, debt_asset, user) -> (Position, collateral, debt)
    let posRes;
    try {
      posRes = await provider.callContract({
        contractAddress: poolAddress,
        entrypoint: 'position',
        calldata: [String(collateralInfo.address), String(debtInfo.address), String(user)]
      });
    } catch (e) {
      console.log(JSON.stringify({
        success: false,
        error: 'Failed to fetch position from pool',
        nextStep: 'RPC_OR_ABI_ERROR',
        details: e?.message || String(e)
      }));
      process.exit(1);
    }

    const out = Array.isArray(posRes) ? posRes : (posRes?.result || []);
    if (out.length < 8) {
      console.log(JSON.stringify({
        success: false,
        error: 'Unexpected Pool.position return shape',
        nextStep: 'RPC_OR_ABI_ERROR',
        details: { len: out.length, out: out.slice(0, 8) }
      }));
      process.exit(1);
    }

    const collateralShares = u256ToBigInt([out[0], out[1]]);
    const nominalDebt = u256ToBigInt([out[2], out[3]]);
    const collateralAssets = u256ToBigInt([out[4], out[5]]);
    const debtAssets = u256ToBigInt([out[6], out[7]]);

    const collateralHuman = formatUnits(collateralAssets, collateralInfo.decimals);
    const debtHuman = formatUnits(debtAssets, debtInfo.decimals);

    // Optional: oracle-based LTV if oracleAddress configured and oracle call works
    let ltv = null;
    let prices = null;
    const oracleAddress = poolCfg.oracleAddress;
    if (oracleAddress && isHexAddress(String(oracleAddress))) {
      try {
        const oraclePrice = async (assetAddr) => {
          const r = await provider.callContract({
            contractAddress: String(oracleAddress),
            entrypoint: 'price',
            calldata: [String(assetAddr)]
          });
          const o = Array.isArray(r) ? r : (r?.result || []);
          if (o.length < 3) return null;
          return {
            value: u256ToBigInt([o[0], o[1]]),
            isValid: (BigInt(String(o[2])) !== 0n)
          };
        };
        const cp = await oraclePrice(collateralInfo.address);
        const dp = await oraclePrice(debtInfo.address);
        if (cp?.isValid && dp?.isValid && cp.value > 0n && dp.value > 0n) {
          prices = {
            collateralPrice18: cp.value.toString(),
            debtPrice18: dp.value.toString()
          };
          // Both prices are 18 decimals; value = amountBase * price / 10^decimals
          const collValue = (collateralAssets * cp.value) / (10n ** BigInt(collateralInfo.decimals));
          const debtValue = (debtAssets * dp.value) / (10n ** BigInt(debtInfo.decimals));
          ltv = collValue === 0n ? null : Number((debtValue * 10000n) / collValue) / 100; // percent with 2 decimals
        }
      } catch {
        // ignore
      }
    }

    console.log(JSON.stringify({
      success: true,
      protocol: 'VESU',
      action: 'position',
      pool: poolName,
      poolAddress,
      user,
      pair: { collateral: collateralInfo.symbol, debt: debtInfo.symbol },
      position: {
        collateralSharesNative: collateralShares.toString(),
        nominalDebtNative: nominalDebt.toString(),
        collateralAssetsBaseUnits: collateralAssets.toString(),
        debtAssetsBaseUnits: debtAssets.toString(),
        collateralAssetsHuman: collateralHuman,
        debtAssetsHuman: debtHuman
      },
      prices,
      ltvPercent: ltv
    }));
    return;
  }

  if (action === 'supply') {
    if (!collateralToken) {
      console.log(JSON.stringify({ success: false, error: 'Missing collateralToken/token' }));
      process.exit(1);
    }
    collateralInfo = await resolveToken(collateralToken);
    if (!collateralInfo) {
      console.log(JSON.stringify({ success: false, error: `Unknown token: ${collateralToken}` }));
      process.exit(1);
    }

    const defaultDebt = poolCfg.defaultDebtAssetSymbol;
    if (!defaultDebt) {
      console.log(JSON.stringify({
        success: false,
        error: 'Pool config missing defaultDebtAssetSymbol (required for supply flows)',
        nextStep: 'CONFIGURE_VESU_POOL'
      }));
      process.exit(1);
    }
    debtInfo = await resolveToken(defaultDebt);
    if (!debtInfo) {
      console.log(JSON.stringify({ success: false, error: `Unknown default debt token: ${defaultDebt}` }));
      process.exit(1);
    }
  }

  if (action === 'borrow') {
    if (!collateralToken) {
      console.log(JSON.stringify({ success: false, error: 'Borrow requires collateralToken' }));
      process.exit(1);
    }
    if (!debtToken || !input.debtAmount) {
      console.log(JSON.stringify({ success: false, error: 'Borrow requires debtToken + debtAmount' }));
      process.exit(1);
    }

    collateralInfo = await resolveToken(collateralToken);
    debtInfo = await resolveToken(debtToken);
    if (!collateralInfo) {
      console.log(JSON.stringify({ success: false, error: `Unknown collateral token: ${collateralToken}` }));
      process.exit(1);
    }
    if (!debtInfo) {
      console.log(JSON.stringify({ success: false, error: `Unknown debt token: ${debtToken}` }));
      process.exit(1);
    }

    // Option 1 UX: if collateralAmount is missing, quote the required collateral and stop.
    if (!input.collateralAmount) {
      try {
        const oracleAddress = poolCfg.oracleAddress;
        if (!oracleAddress || !isHexAddress(String(oracleAddress))) {
          console.log(JSON.stringify({
            success: false,
            canProceed: false,
            nextStep: 'CONFIGURE_VESU_ORACLE',
            pool: poolName,
            poolAddress,
            message: 'Configure protocols.json → VESU.pools[poolName].oracleAddress'
          }));
          return;
        }


        const oraclePrice = async (assetAddr) => {
          const r = await provider.callContract({
            contractAddress: String(oracleAddress),
            entrypoint: 'price',
            calldata: [String(assetAddr)]
          });
          const out = Array.isArray(r) ? r : (r?.result || []);
          if (out.length >= 3) {
            return {
              value: u256ToBigInt([out[0], out[1]]),
              isValid: (BigInt(String(out[2])) !== 0n)
            };
          }
          throw new Error(`Unexpected oracle.price return shape (len=${out.length})`);
        };

        const collateralP = await oraclePrice(collateralInfo.address);
        const debtP = await oraclePrice(debtInfo.address);
        if (!collateralP.isValid || !debtP.isValid || collateralP.value === 0n || debtP.value === 0n) {
          throw new Error('Oracle returned invalid price');
        }
        const cp = collateralP.value;
        const dp = debtP.value;

        // --- Read pair config max_ltv (no ABI required) ---
        const pairCall = async (entrypoint) => provider.callContract({
          contractAddress: poolAddress,
          entrypoint,
          calldata: [String(collateralInfo.address), String(debtInfo.address)]
        });

        let maxLtv = 0n;
        let pairErr = null;
        try {
          let pairRes = null;
          try { pairRes = await pairCall('pair_config'); } catch {}
          if (!pairRes) {
            try { pairRes = await pairCall('pair_configs'); } catch {}
          }
          if (pairRes?.result?.length >= 1) {
            const pr = pairRes.result;
            maxLtv = pr.length >= 2 ? u256ToBigInt([pr[0], pr[1]]) : BigInt(String(pr[0]));
          }
        } catch (e) {
          pairErr = e;
        }

        if (maxLtv === 0n) {
          // Fallback to configured maxLtv (SCALE u256, e.g. 700000000000000000 for 70%)
          if (poolCfg.maxLtv) {
            maxLtv = u256ToBigInt(poolCfg.maxLtv);
          }
        }

        if (maxLtv === 0n) {
          console.log(JSON.stringify({
            success: true,
            canProceed: false,
            nextStep: 'CONFIGURE_VESU_MAX_LTV',
            pool: poolName,
            poolAddress,
            message: 'Could not read max_ltv onchain for this pair. Add maxLtv to protocols.json → VESU.pools[poolName].maxLtv (u256 SCALE).',
            details: pairErr?.message
          }));
          return;
        }

        // Prices are 18 decimals. Assume maxLtv is SCALE (0..1e18).
        const debtBase = parseAmountToBaseUnits(input.debtAmount, debtInfo.decimals);
        const debtValue = (debtBase * dp) / (10n ** BigInt(debtInfo.decimals));
        // required collateral value = debtValue / maxLtv
        const requiredCollateralValue = (debtValue * (10n ** 18n) + (maxLtv - 1n)) / maxLtv; // ceil
        const requiredCollateralBase = (requiredCollateralValue * (10n ** BigInt(collateralInfo.decimals))) / cp;

        // buffer 15%
        const recommendedCollateralBase = (requiredCollateralBase * 115n) / 100n;

        console.log(JSON.stringify({
          success: true,
          canProceed: false,
          nextStep: 'QUOTE_COLLATERAL_REQUIRED',
          pool: poolName,
          collateralToken: collateralInfo.symbol,
          debtToken: debtInfo.symbol,
          debtAmount: String(input.debtAmount),
          requiredCollateralBaseUnits: requiredCollateralBase.toString(),
          recommendedCollateralBaseUnits: recommendedCollateralBase.toString(),
          message: `To borrow ${input.debtAmount} ${debtInfo.symbol}, you need at least ~${requiredCollateralBase.toString()} base units of ${collateralInfo.symbol} (recommend +15% buffer). Provide collateralAmount to proceed.`
        }));
        return;
      } catch (e) {
        console.log(JSON.stringify({
          success: false,
          error: 'Failed to compute collateral quote',
          nextStep: 'RPC_OR_ABI_ERROR',
          details: e?.message || String(e)
        }));
        process.exit(1);
      }
    }
  }

  // Amounts (execution path)
  const collateralAmountHuman = action === 'borrow' ? input.collateralAmount : input.amount;
  const debtAmountHuman = action === 'borrow' ? input.debtAmount : '0';

  if (!collateralAmountHuman) {
    console.log(JSON.stringify({ success: false, error: 'Missing amount/collateralAmount' }));
    process.exit(1);
  }

  const collateralBase = parseAmountToBaseUnits(collateralAmountHuman, collateralInfo.decimals);
  const debtBase = parseAmountToBaseUnits(debtAmountHuman, debtInfo.decimals);

  // Build ModifyPositionParams
  // We try to build in a shape that starknet.js CallData can compile.
  // Because enum encoding differs, we include a primary + fallback key.
  const collateralAmount = {
    denomination: { Assets: {} },
    value: collateralBase.toString()
  };
  const debtAmount = {
    denomination: { Assets: {} },
    value: debtBase.toString()
  };

  const params = {
    collateral_asset: collateralInfo.address,
    debt_asset: debtInfo.address,
    user,
    collateral: collateralAmount,
    debt: debtAmount
  };

  // Compile calldata for modify_position
  // For Vesu Pool, we use manual calldata construction since we know the exact structure
  const toFelt = (hex) => String(hex);
  const toU256 = (n) => {
    const big = BigInt(n);
    const low = (big & ((1n << 128n) - 1n)).toString();
    const high = (big >> 128n).toString();
    return [low, high];
  };
  
  // Collateral Amount: denomination 1 (Assets), value as u256
  const [cLow, cHigh] = toU256(collateralBase);
  // Debt Amount: denomination 1 (Assets), value as u256  
  const [dLow, dHigh] = toU256(debtBase);
  
  // Flattened calldata for modify_position(params)
  const calldata = [
    toFelt(collateralInfo.address),  // collateral_asset
    toFelt(debtInfo.address),        // debt_asset
    toFelt(user),                    // user
    '1',                             // collateral.denomination (Assets = 1)
    cLow,                            // collateral.value.low
    cHigh,                           // collateral.value.high
    '1',                             // debt.denomination (Assets = 1)
    dLow,                            // debt.value.low
    dHigh                            // debt.value.high
  ];

  console.log(JSON.stringify({
    success: true,
    protocol: 'VESU',
    pool: poolName,
    poolAddress,
    action,
    call: {
      contractAddress: poolAddress,
      method: 'modify_position',
      args: calldata
    },
    note: 'This call uses Pool.modify_position under the hood.'
  }));
}

main().catch(err => {
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
});
