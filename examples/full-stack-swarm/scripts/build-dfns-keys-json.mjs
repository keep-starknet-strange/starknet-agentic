#!/usr/bin/env node
import fs from "node:fs";

function normalizeHex(hex) {
  if (typeof hex !== "string") throw new Error("publicKey must be a string");
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(h) || h.length % 2 !== 0) {
    throw new Error(`invalid hex: ${hex}`);
  }
  return `0x${h}`;
}

function hexToBytes(hex) {
  return Buffer.from(normalizeHex(hex).slice(2), "hex");
}

function toCompressedStarkPublicKey(pubHex) {
  const b = hexToBytes(pubHex);

  if (b.length === 33 && (b[0] === 0x02 || b[0] === 0x03)) {
    return normalizeHex(pubHex);
  }

  if (b.length === 65 && b[0] === 0x04) {
    const x = b.subarray(1, 33);
    const y = b.subarray(33, 65);
    const prefix = (y[31] & 1) === 1 ? 0x03 : 0x02;
    return `0x${Buffer.concat([Buffer.from([prefix]), x]).toString("hex")}`;
  }

  if (b.length === 32) {
    throw new Error("Dfns publicKey is x-only (32 bytes); cannot derive compressed key safely.");
  }

  throw new Error(`unsupported Stark public key format (${b.length} bytes)`);
}

function sessionPublicKeyFromCompressed(compHex) {
  const b = hexToBytes(compHex);
  const xHex = b.subarray(1).toString("hex").replace(/^0+/, "");
  return `0x${xHex || "0"}`;
}

function main() {
  const prefix = process.argv[2] ?? "agent";
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    throw new Error("No JSON input received on stdin. Pipe DFNS /keys response into this script.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON input: ${err instanceof Error ? err.message : String(err)}`);
  }

  const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
  const starkKeys = items.filter(
    (k) => k && k.scheme === "ECDSA" && k.curve === "stark" && k.status === "Active",
  );
  if (starkKeys.length === 0) {
    throw new Error("No active Stark ECDSA keys found.");
  }

  const out = starkKeys.map((k, i) => {
    const verificationPublicKey = toCompressedStarkPublicKey(k.publicKey);
    const sessionPublicKey = sessionPublicKeyFromCompressed(verificationPublicKey);
    return {
      keyId: `${prefix}-${i + 1}`,
      dfnsKeyId: k.id,
      sessionPublicKey,
      verificationPublicKey,
    };
  });

  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main();
