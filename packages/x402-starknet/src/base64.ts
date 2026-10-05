import { MAX_HEADER_LENGTH } from "./constants.js"
import { X402PaymentError } from "./errors.js"

// The x402 v2 HTTP transport carries PAYMENT-REQUIRED and PAYMENT-SIGNATURE as
// standard base64 (RFC 4648 section 4) of JSON. The reference client's decoder gate is
// /^[A-Za-z0-9+/]*={0,2}$/, so base64url is not interoperable and is refused here
// instead of being silently translated.
const STANDARD_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const utf8 = new TextDecoder("utf-8", { fatal: true })

/**
 * Decode a standard-base64 JSON header value. Surrounding whitespace is ignored
 * (HTTP field values never carry it); everything else must be canonical standard
 * base64 of UTF-8 JSON. Padding is optional, as with the reference decoder.
 */
export function decodeBase64Json(value: unknown, label: string): unknown {
  if (typeof value !== "string") {
    throw new X402PaymentError("invalid_header", `${label} must be a string`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new X402PaymentError("invalid_header", `${label} is empty`)
  }
  if (trimmed.length > MAX_HEADER_LENGTH) {
    throw new X402PaymentError(
      "invalid_header",
      `${label} is ${trimmed.length} characters, more than the ${MAX_HEADER_LENGTH} accepted`,
    )
  }
  if (/[-_]/.test(trimmed)) {
    throw new X402PaymentError(
      "invalid_header",
      `${label} is base64url; x402 v2 headers are standard base64 (RFC 4648 section 4)`,
    )
  }
  if (!STANDARD_BASE64.test(trimmed) || trimmed.length % 4 === 1) {
    throw new X402PaymentError("invalid_header", `${label} is not valid standard base64`)
  }
  if (trimmed.includes("=") && trimmed.length % 4 !== 0) {
    throw new X402PaymentError("invalid_header", `${label} has misplaced base64 padding`)
  }

  const bytes = Buffer.from(trimmed, "base64")
  // Buffer.from is lenient; re-encoding catches non-canonical trailing bits.
  if (bytes.toString("base64").replace(/=+$/, "") !== trimmed.replace(/=+$/, "")) {
    throw new X402PaymentError("invalid_header", `${label} is not canonical base64`)
  }

  let text: string
  try {
    text = utf8.decode(bytes)
  } catch {
    throw new X402PaymentError("invalid_header", `${label} does not decode to UTF-8`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new X402PaymentError("invalid_header", `${label} does not decode to JSON`)
  }
}

/** Encode a value as standard base64 (with padding) of its UTF-8 JSON. */
export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
}
