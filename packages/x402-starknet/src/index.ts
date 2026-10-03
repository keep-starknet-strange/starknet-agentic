import { X402Scheme, PaymentRequirements, PaymentSignature } from '@x402/core';
import type { TypedData, Signature } from 'starknet';

/**
 * x402 Starknet payment scheme implementation.
 *
 * Builds and signs an OutsideExecution from PaymentRequirements per the
 * registered exact/Starknet scheme (x402-foundation/x402 #2849).
 *
 * The client MUST:
 *  1. Reconstruct the canonical typed data from the five message fields.
 *  2. Verify the final message against its own intent before signing:
 *     exactly one Call with To = asset, Selector = sn_keccak("transfer"),
 *     Calldata = [payTo, amount_low, amount_high], Caller = extra.feePayer.
 *  3. Sign and return the standard PAYMENT-SIGNATURE wire format.
 */

export interface StarknetPaymentOptions {
  /** The typed-data domain (chainId, version, contractAddress) */
  domain: {
    chainId: string;
    version: string;
    contractAddress: string;
  };
  /** External account / signer — any object exposing `signMessage(typedData)` */
  signer: {
    address: `0x${string}`;
    signMessage: (typedData: TypedData) => Promise<Signature>;
  };
}

/**
 * Decode a base64 string (standard or url-safe, auto-corrects padding).
 */
function decodeBase64(str: string): string {
  // Normalize to standard base64
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

/**
 * Encode a string as standard base64 (RFC 4648).
 */
function encodeBase64(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Parse base64 payload into a JSON object.
 */
function parseBase64Json<T = unknown>(b64: string): T {
  const json = decodeBase64(b64);
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error('PAYMENT-SIGNATURE payload is not valid JSON');
  }
}

/**
 * Validate that a decoded OutsideExecution payload matches PaymentRequirements.
 *
 * The registered exact/Starknet scheme requires the signer to verify:
 *   - exactly one Call
 *   - Call.To      == requirements.asset
 *   - Call.Selector == sn_keccak("transfer")  (precomputed hex)
 *   - Call.Calldata == [payTo, amount_low, amount_high]
 *   - Call.Caller   == requirements.extra.feePayer
 *
 * If validation fails the caller must reject the server's response.
 */
export function validateOutsideExecution(
  payload: {
    typedData: TypedData;
    signature: Signature;
  },
  requirements: PaymentRequirements,
): void {
  const td = payload.typedData;

  // The registered scheme defines a single static Call structure.
  const SN_KECCAK_TRANSFER =
    '0x99cd8bde55d84523bea0c89f672ed6669e1f43c3e187f536689c7a6f4a480';

  const primaryType = td.primaryType;
  if (primaryType !== 'OutsideExecution') {
    throw new Error(
      `Invalid primaryType: expected OutsideExecution, got ${primaryType}`,
    );
  }

  const calls = td.message?.calls as
    | Array<{
        to: string;
        selector: string;
        calldata: string[];
        caller: string;
      }>
    | undefined;

  if (!calls || calls.length !== 1) {
    throw new Error(
      `Expected exactly one Call, got ${calls?.length ?? 'none'}`,
    );
  }

  const [call] = calls;

  if (call.to.toLowerCase() !== requirements.asset.toLowerCase()) {
    throw new Error(
      `Call.To mismatch: expected ${requirements.asset}, got ${call.to}`,
    );
  }

  if (call.selector !== SN_KECCAK_TRANSFER) {
    throw new Error(
      `Call.Selector mismatch: expected sn_keccak("transfer"), got ${call.selector}`,
    );
  }

  const payTo = requirements.payTo as string;
  const amount = BigInt(requirements.amount);
  const amountLow = amount & 0x7ffffffffffffffffffffffffffffffn;
  const amountHigh = amount >> 128n;

  const expectedCalldata = [payTo, amountLow.toString(16), amountHigh.toString(16)];
  const actualCalldata = call.calldata as string[];

  if (actualCalldata.length !== 3) {
    throw new Error(`Call.Calldata length mismatch: expected 3, got ${actualCalldata.length}`);
  }
  for (let i = 0; i < 3; i++) {
    if (actualCalldata[i] !== expectedCalldata[i]) {
      throw new Error(`Call.Calldata[${i}] mismatch: expected ${expectedCalldata[i]}, got ${actualCalldata[i]}`);
    }
  }

  const expectedCaller = (requirements.extra?.feePayer as string) ?? '0x0';
  if (call.caller.toLowerCase() !== expectedCaller.toLowerCase()) {
    throw new Error(
      `Call.Caller mismatch: expected ${expectedCaller}, got ${call.caller}`,
    );
  }
}

/**
 * Build the canonical OutsideExecution typed-data document from PaymentRequirements.
 *
 * This is what the registered exact/Starknet scheme mandates: "the client builds
 * and signs the OutsideExecution from the PaymentRequirements alone".
 */
export function buildOutsideExecutionTypedData(
  requirements: PaymentRequirements,
  validUntil: number,
): TypedData {
  const amount = BigInt(requirements.amount);
  const amountLow = amount & 0x7ffffffffffffffffffffffffffffffn;
  const amountHigh = amount >> 128n;

  const payTo = requirements.payTo as string;
  const asset = requirements.asset as string;
  const feePayer = (requirements.extra?.feePayer as string) ?? '0x0';

  return {
    types: {
      StarknetDomain: [
        { name: 'name', type: 'felt' },
        { name: 'version', type: 'felt' },
        { name: 'chainId', type: 'felt' },
      ],
      OutsideExecution: [
        { name: 'caller', type: 'felt' },
        { name: 'nonce', type: 'felt' },
        { name: 'validAfter', type: 'felt' },
        { name: 'validUntil', type: 'felt' },
        { name: 'calls', type: 'Call*' },
      ],
      Call: [
        { name: 'to', type: 'felt' },
        { name: 'selector', type: 'felt' },
        { name: 'calldata', type: 'felt*' },
      ],
    },
    primaryType: 'OutsideExecution',
    domain: {
      name: 'OpenZeppelinAccount',
      version: '1',
      // chainId will be set by the caller from network
      chainId: '',
    },
    message: {
      caller: feePayer,
      nonce: BigInt(Math.floor(Date.now() / 1000)).toString(),
      validAfter: '0',
      validUntil: validUntil.toString(),
      calls: [
        {
          to: asset,
          selector: '0x99cd8bde55d84523bea0c89f672ed6669e1f43c3e187f536689c7a6f4a480',
          calldata: [payTo, amountLow.toString(16), amountHigh.toString(16)],
        },
      ],
    },
  };
}

/**
 * Build the standard PAYMENT-SIGNATURE wire format for the exact/Starknet scheme.
 *
 * Wire format (standard base64):
 *   {
 *     x402Version: 2,
 *     accepted: true,
 *     payload: {
 *       from: <signer address>,
 *       outsideExecution: {
 *         typedData: <TypedData>,
 *         signature: <Signature>
 *       }
 *     }
 *   }
 */
export function buildPaymentSignatureHeader(
  options: StarknetPaymentOptions,
  requirements: PaymentRequirements,
  validUntil: number,
): string {
  const typedData = buildOutsideExecutionTypedData(requirements, validUntil);

  // Set the chainId from network
  const network = requirements.network as 'starknet:SN_SEPOLIA' | 'starknet:SN_MAIN' | undefined;
  if (typedData.domain) {
    typedData.domain.chainId =
      network === 'starknet:SN_MAIN' ? 'SN_MAIN' : 'SN_SEPOLIA';
  }

  const signature = options.signer.signMessage(typedData);

  const payload = {
    from: options.signer.address,
    outsideExecution: {
      typedData,
      signature,
    },
  };

  const headerObj = {
    x402Version: 2,
    accepted: true,
    payload,
  };

  return encodeBase64(JSON.stringify(headerObj));
}

/**
 * Create the Starknet payment signature header from PaymentRequirements.
 *
 * Per the registered exact/Starknet scheme, the CLIENT builds the document
 * from requirements alone — never trusting server-supplied typedData.
 *
 * @param options   Signer and domain configuration
 * @param requirements  Decoded PaymentRequirements from PAYMENT-REQUIRED
 * @param validUntil  Unix timestamp (seconds) after which the signature expires
 * @returns Standard base64-encoded PAYMENT-SIGNATURE header value
 */
export async function createStarknetPaymentSignatureHeader(
  options: StarknetPaymentOptions,
  requirements: PaymentRequirements,
  validUntil: number,
): Promise<string> {
  const typedData = buildOutsideExecutionTypedData(requirements, validUntil);

  // Set the chainId from network
  const network = requirements.network as 'starknet:SN_SEPOLIA' | 'starknet:SN_MAIN' | undefined;
  if (typedData.domain) {
    typedData.domain.chainId =
      network === 'starknet:SN_MAIN' ? 'SN_MAIN' : 'SN_SEPOLIA';
  }

  const signature = await options.signer.signMessage(typedData);

  const payload = {
    from: options.signer.address,
    outsideExecution: {
      typedData,
      signature,
    },
  };

  const headerObj = {
    x402Version: 2,
    accepted: true,
    payload,
  };

  return encodeBase64(JSON.stringify(headerObj));
}

/**
 * x402 Starknet scheme registration.
 */
export const starknetScheme: X402Scheme = {
  name: 'exact/Starknet',
  /**
   * Returns the supported networks for this scheme.
   */
  supportedNetworks: ['starknet:SN_SEPOLIA', 'starknet:SN_MAIN'],

  /**
   * Decode the PAYMENT-REQUIRED header into structured PaymentRequirements.
   * The header is standard base64 of a PaymentRequired document.
   */
  decodePaymentRequired(b64: string): PaymentRequirements {
    const json = decodeBase64(b64);
    try {
      return JSON.parse(json) as PaymentRequirements;
    } catch {
      throw new Error('PAYMENT-REQUIRED payload is not valid JSON');
    }
  },

  /**
   * Build the PAYMENT-SIGNATURE header from PaymentRequirements.
   * The client builds the OutsideExecution from requirements (not server-supplied typedData).
   */
  async buildPaymentSignature(
    options: StarknetPaymentOptions,
    requirements: PaymentRequirements,
    validUntil: number,
  ): Promise<string> {
    return createStarknetPaymentSignatureHeader(options, requirements, validUntil);
  },

  /**
   * Validate a received PAYMENT-SIGNATURE against the original requirements.
   */
  async validatePaymentSignature(
    b64: string,
    requirements: PaymentRequirements,
  ): Promise<void> {
    const decoded = parseBase64Json<{
      x402Version: number;
      accepted: boolean;
      payload: {
        from: string;
        outsideExecution: {
          typedData: TypedData;
          signature: Signature;
        };
      };
    }>(b64);

    if (decoded.x402Version !== 2) {
      throw new Error(`Unsupported x402Version: ${decoded.x402Version}`);
    }
    if (!decoded.accepted) {
      throw new Error('Payment not accepted');
    }

    validateOutsideExecution(decoded.payload.outsideExecution, requirements);
  },
};
