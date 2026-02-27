function tokenize(value) {
  return String(value || '')
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase()
    .split(/[_\-]+/)
    .filter(Boolean);
}

export function calculateSimilarity(query, target) {
  const q = String(query || '').toLowerCase();
  const t = String(target || '').toLowerCase();
  if (!q || !t) return 0;

  if (t === q) return 100;
  if (t.includes(q)) return 70 + (q.length / t.length) * 20;
  if (q.includes(t)) return 60 + (t.length / q.length) * 15;

  let score = 0;
  const qTokens = tokenize(query);
  const tTokens = tokenize(target);
  const MAX_SUBSTRING_LEN = 6;
  const MAX_SUBSTRING_STARTS = 12;

  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (qt === tt) score += 30;
      else if (tt.includes(qt)) score += 20;
      else if (qt.includes(tt)) score += 15;
      else {
        const maxLen = Math.min(MAX_SUBSTRING_LEN, qt.length, tt.length);
        for (let len = 3; len <= maxLen; len++) {
          const maxStarts = Math.min(qt.length - len + 1, MAX_SUBSTRING_STARTS);
          for (let i = 0; i < maxStarts; i++) {
            if (tt.includes(qt.substring(i, i + len))) {
              score += len * 2;
              break;
            }
          }
        }
      }
    }
  }

  return Math.min(100, Math.round(score));
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse decimal amount safely into base units (BigInt) given token decimals.
// Accepts integer/decimal strings and numbers (numbers must not be in scientific notation).
export function parseAmountToBaseUnits(amount, decimals) {
  const dec = Number(decimals ?? 18);
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }

  if (amount === null || amount === undefined) {
    throw new Error('Missing amount');
  }

  let s;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new Error('Amount must be finite');
    s = String(amount);
    if (/[eE]/.test(s)) {
      throw new Error('Amount in scientific notation not supported; pass amount as a string');
    }
  } else if (typeof amount === 'string') {
    s = amount.trim();
  } else {
    throw new Error(`Unsupported amount type: ${typeof amount}`);
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    throw new Error(`Invalid amount format: ${s}`);
  }

  const [intPart, fracPartRaw = ''] = s.split('.');
  if (fracPartRaw.length > dec) {
    throw new Error(`Too many decimal places: got ${fracPartRaw.length}, token supports ${dec}`);
  }

  const base = 10n ** BigInt(dec);
  const intBI = BigInt(intPart || '0');
  const fracPadded = (fracPartRaw + '0'.repeat(dec)).slice(0, dec);
  const fracBI = BigInt(fracPadded || '0');
  return intBI * base + fracBI;
}
