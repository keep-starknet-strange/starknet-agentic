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
