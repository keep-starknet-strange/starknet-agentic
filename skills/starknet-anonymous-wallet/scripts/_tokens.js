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
    const size = 200;
    const all = [];
    let page = 0;

    while (true) {
      const resp = await fetchTokens({ page, size, tags: ['Verified'] });
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

    tokenCache = all;
    lastTokenFetch = now;
    return tokenCache;
  } catch {
    return tokenCache || [];
  }
}
