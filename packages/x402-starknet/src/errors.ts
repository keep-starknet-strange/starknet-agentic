/**
 * Every refusal to build or sign a payment throws this error. `code` is stable
 * so callers and tests can switch on it; `message` is for humans.
 */
export type X402PaymentErrorCode =
  | "invalid_arguments"
  | "invalid_header"
  | "invalid_payment_required"
  | "no_matching_requirements"
  | "invalid_payment_requirements"
  | "intent_mismatch"
  | "invalid_signature"

export class X402PaymentError extends Error {
  readonly code: X402PaymentErrorCode

  constructor(code: X402PaymentErrorCode, message: string) {
    super(message)
    this.name = "X402PaymentError"
    this.code = code
  }
}
