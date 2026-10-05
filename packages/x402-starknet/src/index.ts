/**
 * x402 `exact` scheme on Starknet, client side.
 *
 * The client builds the SNIP-9 v2 `OutsideExecution` it signs from the
 * `PaymentRequirements` alone (one `transfer(payTo, amount)` on `asset`,
 * `Caller = extra.feePayer`), checks the document against that intent, signs it,
 * and returns the standard-base64 `PAYMENT-SIGNATURE` header. Nothing the server
 * sends is signed as received.
 *
 * Spec: x402-foundation/x402 specs/schemes/exact/scheme_exact_starknet.md at
 * {@link SPEC_REVISION}.
 */

export {
  ANY_CALLER,
  DEFAULT_MAX_TIMEOUT_SECONDS_CAP,
  EXACT_SCHEME,
  EXECUTE_AFTER,
  MAX_TIMEOUT_SECONDS_CAP_LIMIT,
  SNIP12_REVISION,
  SNIP9_DOMAIN_NAME,
  SNIP9_DOMAIN_VERSION,
  SPEC_REVISION,
  STARKNET_NETWORKS,
  STARKNET_NETWORK_IDS,
  TRANSFER_SELECTOR,
  X402_VERSION,
  type StarknetNetwork,
} from "./constants.js"
export { X402PaymentError, type X402PaymentErrorCode } from "./errors.js"
export {
  decodePaymentRequiredHeader,
  feltEquals,
  isStarknetAddress,
  networkForChainId,
  parseExactStarknetRequirements,
  selectPaymentRequirements,
  type DecodedPaymentRequired,
  type ExactStarknetRequirements,
  type RequirementsPolicy,
  type SelectedRequirements,
  type SelectionOptions,
} from "./requirements.js"
export {
  buildOutsideExecutionTypedData,
  OUTSIDE_EXECUTION_TYPES,
  splitU256,
  type OutsideExecutionCall,
  type OutsideExecutionDomain,
  type OutsideExecutionMessage,
  type OutsideExecutionTypedData,
  type PaymentAuthorization,
} from "./typedData.js"
export { assertTypedDataMatchesIntent, type PaymentIntent } from "./intent.js"
export {
  createStarknetPaymentSignatureHeader,
  decodePaymentSignatureHeader,
  prepareStarknetPayment,
  signPreparedStarknetPayment,
  type CreatePaymentSignatureArgs,
  type ExactStarknetPaymentPayload,
  type PaymentSigner,
  type PaymentSummary,
  type PreparedStarknetPayment,
  type PrepareOptions,
  type SignedStarknetPayment,
  type SignOptions,
} from "./payment.js"
