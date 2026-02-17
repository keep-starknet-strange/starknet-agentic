import { fetchTokens } from '@avnu/avnu-sdk';

let tokenCache = null;
let lastTokenFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchVerifiedTokens() {
  const now = Date.now();
  if (tokenCache && (now - lastTokenFetch) < CACHE_TTL) {
    return tokenCache;
  }

  try {
    const resp = await fetchTokens({ page: 0, size: 200, tags: ['Verified'] });
    tokenCache = resp?.content || [];
    lastTokenFetch = now;
    return tokenCache;
  } catch {
    return tokenCache || [];
  }
}
