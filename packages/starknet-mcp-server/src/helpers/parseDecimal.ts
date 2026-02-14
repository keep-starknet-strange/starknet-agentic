/**
 * Convert a human-readable decimal string to a BigInt with the given decimals,
 * without floating-point precision loss.
 *
 * parseDecimalToBigInt("1.5", 18) → 1500000000000000000n
 * parseDecimalToBigInt("0.1", 6)  → 100000n
 */
export function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal amount: "${value}". Must be a non-negative number.`);
  }
  const [intPart, fracPart = ""] = trimmed.split(".");

  // Truncate or pad fractional part to exactly `decimals` digits
  const adjustedFrac = fracPart.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(intPart + adjustedFrac);
}
