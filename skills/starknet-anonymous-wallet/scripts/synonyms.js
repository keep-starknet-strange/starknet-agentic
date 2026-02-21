// ERC-20 and DeFi Action Synonyms
// Maps user-friendly terms to canonical ABI function names

export const ERC20_SYNONYMS = {
  // Transfer operations
  'send': ['transfer', 'move', 'pay', 'dispatch', 'forward'],
  'transfer': ['send', 'move', 'pay', 'transmit'],
  
  // Approval operations  
  'approve': ['allow', 'authorize', 'permit', 'enable', 'grant'],
  'increase_allowance': ['increase approval', 'add allowance', 'more allowance'],
  'decrease_allowance': ['decrease approval', 'reduce allowance', 'less allowance'],
  
  // Balance operations
  'balance_of': ['balance', 'check balance', 'get balance', 'how much', 'view balance'],
  
  // Token info
  'total_supply': ['total supply', 'supply', 'max supply', 'circulating'],
  'decimals': ['decimals', 'precision', 'places'],
  'symbol': ['symbol', 'ticker', 'name'],
  
  // Mint/Burn
  'mint': ['create', 'issue', 'generate', 'mint tokens'],
  'burn': ['destroy', 'delete', 'remove', 'burn tokens'],
};

export const DEFI_SYNONYMS = {
  // Swapping
  'swap': ['exchange', 'trade', 'convert', 'switch', 'flip', 'change'],
  'swap_exact_tokens_for_tokens': ['swap', 'exchange tokens', 'trade tokens'],
  
  // Liquidity
  'add_liquidity': ['add liquidity', 'provide liquidity', 'lp', 'pool', 'deposit liquidity'],
  'remove_liquidity': ['remove liquidity', 'withdraw liquidity', 'take out liquidity'],
  
  // Staking
  'stake': ['stake', 'lock', 'deposit', 'farm', 'pool', 'commit'],
  'unstake': ['unstake', 'unlock', 'withdraw', 'harvest', 'claim and exit'],
  'claim_rewards': ['claim', 'harvest', 'collect', 'get rewards', 'redeem'],
  
  // Lending/Borrowing
  'deposit': ['deposit', 'add', 'put', 'supply', 'lend'],
  'withdraw': ['withdraw', 'remove', 'take out', 'pull', 'redeem'],
  'borrow': ['borrow', 'take loan', 'get loan', 'lend me'],
  'repay': ['repay', 'pay back', 'return', 'close loan'],
  
  // Bridging
  'bridge': ['bridge', 'move chain', 'cross chain', 'transfer chain', 'wrap'],
  
  // Governance
  'vote': ['vote', 'cast vote', 'support', 'choose'],
  'propose': ['propose', 'suggest', 'create proposal', 'submit'],
  'execute': ['execute', 'run', 'enact', 'implement'],
};

export const COMMON_SYNONYMS = {
  // Generic actions
  'check': ['check', 'view', 'see', 'get', 'read', 'query', 'verify'],
  'create': ['create', 'make', 'generate', 'deploy', 'init'],
  'cancel': ['cancel', 'abort', 'stop', 'revoke', 'undo'],
  
  // Time-related
  'now': ['now', 'immediately', 'asap', 'instant'],
  'later': ['later', 'soon', 'pending', 'queued'],
  
  // Amounts
  'all': ['all', 'everything', 'max', 'maximum', 'full', 'entire'],
  'half': ['half', '50%', '50 percent'],
  'quarter': ['quarter', '25%', '25 percent'],
};

// Reverse lookup - maps variant to canonical
export function buildReverseMap(synonymMap) {
  const reverse = {};
  for (const [canonical, variants] of Object.entries(synonymMap)) {
    reverse[canonical.toLowerCase()] = canonical;
    for (const variant of variants) {
      reverse[variant.toLowerCase()] = canonical;
    }
  }
  return reverse;
}

// All synonyms combined
export const ALL_SYNONYMS = {
  ...ERC20_SYNONYMS,
  ...DEFI_SYNONYMS,
  ...COMMON_SYNONYMS
};

// Reverse lookup for all
export const REVERSE_SYNONYMS = buildReverseMap(ALL_SYNONYMS);

// Function to find canonical action
export function findCanonicalAction(action, abiFunctions = []) {
  const lowerAction = String(action || '').toLowerCase();
  if (!Array.isArray(abiFunctions)) abiFunctions = [];
  if (!lowerAction) return undefined;
  
  // 1. Exact match in ABI
  const exactMatch = abiFunctions.find(f => f.toLowerCase() === lowerAction);
  if (exactMatch) return exactMatch;
  
  // 2. Synonym lookup
  const canonical = REVERSE_SYNONYMS[lowerAction];
  if (canonical) {
    // Find matching ABI function for canonical
    const abiMatch = abiFunctions.find(f => {
      const baseName = f.toLowerCase().split('_')[0];
      return baseName === canonical.toLowerCase() || f.toLowerCase() === canonical.toLowerCase();
    });
    if (abiMatch) return abiMatch;
    
    // Check variant matches
    const variants = ALL_SYNONYMS[canonical] || [];
    for (const variant of [canonical, ...variants]) {
      const match = abiFunctions.find(f => f.toLowerCase().includes(variant.toLowerCase()));
      if (match) return match;
    }
  }
  
  // 3. Partial match in ABI (fallback)
  return abiFunctions.find(f => f.toLowerCase().includes(lowerAction));
}

export default {
  ERC20_SYNONYMS,
  DEFI_SYNONYMS,
  COMMON_SYNONYMS,
  ALL_SYNONYMS,
  REVERSE_SYNONYMS,
  findCanonicalAction,
  buildReverseMap
};