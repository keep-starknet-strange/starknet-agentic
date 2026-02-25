const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,64}$/;

export type ParsedArgs = {
  recipient: string;
  amount: string;
  sponsored: boolean;
  addressOnly: boolean;
  evidence: boolean;
};

export function parseArgs(args: string[]): ParsedArgs {
  let recipient = "";
  let amount = "10";
  let sponsored = false;
  let addressOnly = false;
  let evidence = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--recipient":
        if (!next || next.startsWith("--")) {
          throw new Error("Missing value for --recipient");
        }
        recipient = next;
        i++;
        break;
      case "--amount":
        if (!next || next.startsWith("--")) {
          throw new Error("Missing value for --amount");
        }
        amount = next;
        i++;
        break;
      case "--sponsored":
        sponsored = true;
        break;
      case "--address-only":
        addressOnly = true;
        break;
      case "--evidence":
        evidence = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { recipient, amount, sponsored, addressOnly, evidence };
}

/**
 * Validate a Stark private key expected by this demo.
 * @param privateKey 0x-prefixed private key string with exactly 64 hex characters.
 * @throws Error If `privateKey` does not match the expected Stark key format.
 */
export function assertPrivateKeyFormat(privateKey: string): void {
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    throw new Error(
      "Invalid PRIVATE_KEY format. Expected 0x-prefixed 64-hex string (example: 0x" +
        "a".repeat(64) +
        ").",
    );
  }
}

/**
 * Validate recipient account address format for transfer calls.
 * @param recipientAddress 0x-prefixed hex string between 1 and 64 hex characters.
 * @throws Error If `recipientAddress` is not a valid hex-address string for this demo.
 */
export function assertRecipientAddressFormat(recipientAddress: string): void {
  if (!HEX_ADDRESS_PATTERN.test(recipientAddress)) {
    throw new Error(
      "Invalid recipient address format. Expected 0x-prefixed 1-64 hex chars.",
    );
  }
}

/**
 * Ensure transfer amount parses to a finite positive number.
 * @param amount Transfer amount as a string from CLI/env input.
 * @throws Error If `amount` is not numeric, not finite, or is less than or equal to zero.
 */
export function assertPositiveAmount(amount: string): void {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be a positive number.");
  }
}

export function sanitizeErrorForLog(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err);
  let sanitized = rawMessage.replace(/0x[0-9a-fA-F]{64}/g, "[redacted-hex-64]");

  sanitized = sanitized.replace(
    /\b(PRIVATE_KEY|AVNU_PAYMASTER_API_KEY)\s*[:=]\s*[^\s,;]+/gi,
    "$1=[redacted]",
  );

  for (const secret of [
    process.env.PRIVATE_KEY,
    process.env.AVNU_PAYMASTER_API_KEY,
  ]) {
    if (typeof secret === "string" && secret.length > 0) {
      sanitized = sanitized.split(secret).join("[redacted-secret]");
    }
  }

  return sanitized;
}
