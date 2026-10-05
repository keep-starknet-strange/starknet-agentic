import { fetchTokens } from '@avnu/avnu-sdk';
import { avnuOptions } from './_network.js';

// chainId -> { tokens, fetchedAt }, so one network's addresses never answer
// for another.
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * AVNU verified tokens for `network` (from `getNetwork(provider)` in _network.js).
 * Throws for a missing or unsupported network; AVNU fetch errors return the
 * last cached list for that network, or [].
 */
export async function fetchVerifiedTokens(network) {
  const options = avnuOptions(network);
  const now = Date.now();
  const cached = tokenCache.get(network.chainId);
  if (cached && (now - cached.fetchedAt) < CACHE_TTL) {
    return cached.tokens;
  }

  try {
    const size = 200;
    const all = [];
    let page = 0;

    while (true) {
      const resp = await fetchTokens({ page, size, tags: ['Verified'] }, options);
      const content = Array.isArray(resp?.content) ? resp.content : [];
      all.push(...content);

      const totalPages = Number(
        resp?.totalPages ?? resp?.pages ?? resp?.total_pages ?? NaN
      );
      if (content.length === 0) break;
      page += 1;

      if (Number.isFinite(totalPages) && page >= totalPages) break;
      if (!Number.isFinite(totalPages) && content.length < size) break;
      if (page > 100) break;
    }

    tokenCache.set(network.chainId, { tokens: all, fetchedAt: now });
    return all;
  } catch (err) {
    if (process.env.OPENCLAW_DEBUG === '1') {
      console.error(JSON.stringify({
        warning: `Failed to fetch verified tokens from AVNU (${network.name})`,
        error: err?.message || String(err)
      }));
    }
    return cached?.tokens || [];
  }
}
