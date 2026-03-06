import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, isAbsolute, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export function getSecretsDir() {
  if (process.env.STARKNET_SECRETS_DIR) return process.env.STARKNET_SECRETS_DIR;
  return join(homedir(), '.openclaw', 'secrets', 'starknet');
}

export function loadPrivateKeyByAccountAddress(accountAddress) {
  const dir = getSecretsDir();
  if (!existsSync(dir)) throw new Error('Missing secrets directory: ~/.openclaw/secrets/starknet');

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const target = String(accountAddress).toLowerCase();

  for (const file of files) {
    const accountPath = join(dir, file);
    let data;
    try {
      data = JSON.parse(readFileSync(accountPath, 'utf8'));
    } catch {
      continue;
    }

    if (String(data.address || '').toLowerCase() !== target) continue;

    if (!(typeof data.privateKeyPath === 'string' && data.privateKeyPath.trim().length > 0)) {
      throw new Error('Account is missing privateKeyPath (file-based key is required).');
    }

    const keyPath = isAbsolute(data.privateKeyPath)
      ? data.privateKeyPath
      : join(dir, data.privateKeyPath);

    const resolved = resolve(keyPath);
    const base = resolve(dir);
    if (!(resolved === base || resolved.startsWith(base + sep))) {
      throw new Error('privateKeyPath must resolve within the secrets directory');
    }

    if (!existsSync(resolved)) throw new Error(`Private key file not found: ${resolved}`);
    const privateKey = readFileSync(resolved, 'utf8').trim();
    if (!privateKey) throw new Error('Private key file is empty.');
    return privateKey;
  }

  throw new Error(`Account not found in ~/.openclaw/secrets/starknet for address: ${accountAddress}`);
}
