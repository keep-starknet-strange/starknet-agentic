/**
 * session-invoke: sign SessionAccount calls with a session key and check the outcome.
 *
 * Used by scripts/e2e_test_runner.sh for every session-key row. Runs on Node >= 24
 * without a build step (native TypeScript type stripping): `node src/cli.ts --help`.
 */
import { Account, RpcProvider, constants } from "starknet";
import type { Call } from "starknet";
import { USAGE, UsageError, parseArgs } from "./args.ts";
import type { CliOptions } from "./args.ts";
import { errorDetail, failedCallIndexes, hasRevertReason, isValidationFailure } from "./outcome.ts";
import { SessionAccountSigner, parseSessionSignatureMode } from "./sessionSignature.ts";

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_PRECONDITION = 2;

class PreconditionError extends Error {
  name = "PreconditionError";
}

function log(message: string): void {
  console.log(`[session-invoke] ${message}`);
}

function describeCalls(calls: Call[]): string {
  return calls
    .map((call) => `${call.contractAddress}.${call.entrypoint}(${[call.calldata ?? []].flat().join(", ")})`)
    .join("; ");
}

async function connect(options: CliOptions): Promise<Account> {
  const rpcUrl = process.env.STARKNET_RPC;
  if (!rpcUrl) throw new PreconditionError("STARKNET_RPC is not set");
  const privateKey = process.env.SESSION_PRIVATE_KEY;
  if (!privateKey) throw new PreconditionError("SESSION_PRIVATE_KEY is not set");

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const chainId = await provider.getChainId();
  if (BigInt(chainId) === BigInt(constants.StarknetChainId.SN_MAIN)) {
    throw new PreconditionError("Refusing to run against Starknet mainnet; this helper is for Sepolia E2E runs");
  }

  const [modeFelt] = await provider.callContract({
    contractAddress: options.account,
    entrypoint: "get_session_signature_mode",
  });
  const mode = parseSessionSignatureMode(modeFelt);

  const [validUntil, maxCalls, callsUsed] = (
    await provider.callContract({
      contractAddress: options.account,
      entrypoint: "get_session_data",
      calldata: [options.sessionKey],
    })
  ).map((felt) => BigInt(felt));
  const { timestamp } = await provider.getBlock("latest");
  if (validUntil === 0n) {
    throw new PreconditionError(`Session key ${options.sessionKey} is not registered on ${options.account}`);
  }
  if (BigInt(timestamp) > validUntil) {
    throw new PreconditionError(`Session key expired at ${validUntil} (latest block timestamp ${timestamp})`);
  }
  if (callsUsed >= maxCalls) {
    throw new PreconditionError(`Session key call budget exhausted (${callsUsed}/${maxCalls})`);
  }

  // Signs with the stored session expiry; the contract only checks it against the block timestamp.
  const signer = new SessionAccountSigner({
    privateKey,
    publicKey: options.sessionKey,
    validUntil,
    mode,
  });
  log(`account ${options.account}, session signature v${mode}, session calls used ${callsUsed}/${maxCalls}`);
  // No plugins: nothing may rewrite the calls between signing and submission.
  return new Account({ provider, address: options.account, signer, cairoVersion: "1", plugins: false });
}

/** Fee estimation with validation on: the node runs __validate__ and __execute__ with our signature. */
function estimate(account: Account, calls: Call[]) {
  return account.estimateInvokeFee(calls, { skipValidate: false });
}

async function expectSuccess(account: Account, options: CliOptions): Promise<number> {
  let estimated;
  try {
    estimated = await estimate(account, options.calls);
  } catch (error) {
    log(`FAIL: expected success, but fee estimation failed: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }

  let transaction_hash: string;
  try {
    ({ transaction_hash } = await account.execute(options.calls, {
      resourceBounds: estimated.resourceBounds,
    }));
  } catch (error) {
    log(`FAIL: expected success, but submission failed: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }
  log(`submitted ${transaction_hash}`);

  let receipt;
  try {
    receipt = await account.provider.waitForTransaction(transaction_hash);
  } catch (error) {
    log(`FAIL: ${transaction_hash} was not confirmed: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }
  if (receipt.isReverted()) {
    log(`FAIL: ${transaction_hash} reverted: ${receipt.revert_reason ?? "(no reason)"}`);
    return EXIT_FAIL;
  }
  if (!receipt.isSuccess()) {
    log(`FAIL: ${transaction_hash} has no successful receipt`);
    return EXIT_FAIL;
  }
  const failedCalls = failedCallIndexes(receipt.events, options.account);
  if (failedCalls.length > 0) {
    log(`FAIL: ${transaction_hash} succeeded but SessionAccount emitted CallFailed for call(s) ${failedCalls.join(", ")}`);
    return EXIT_FAIL;
  }
  log(`PASS: ${transaction_hash} succeeded`);
  return EXIT_PASS;
}

async function expectRevert(account: Account, options: CliOptions, reason: string): Promise<number> {
  try {
    await estimate(account, options.calls);
  } catch (error) {
    // Spending-policy panics only happen in __execute__, i.e. after the session signature validated.
    if (hasRevertReason(error, reason)) {
      log(`PASS: __execute__ reverted with "${reason}" (not submitted)`);
      return EXIT_PASS;
    }
    log(`FAIL: expected a revert with "${reason}", got: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }
  log(`FAIL: expected a revert with "${reason}", but the transaction would succeed (not submitted)`);
  return EXIT_FAIL;
}

async function expectReject(account: Account, options: CliOptions): Promise<number> {
  // Same key, nonce and signing path as the rejected calls: if this validates, a rejection
  // of the target calls comes from the session call policy, not the signature.
  log(`control calls: ${describeCalls(options.controlCalls)}`);
  try {
    await estimate(account, options.controlCalls);
  } catch (error) {
    log(`FAIL: control call did not validate, so a rejection cannot be attributed: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }

  try {
    await estimate(account, options.calls);
  } catch (error) {
    if (isValidationFailure(error)) {
      log(`PASS: rejected by __validate__ (not submitted): ${errorDetail(error)}`);
      return EXIT_PASS;
    }
    log(`FAIL: expected __validate__ to reject, got: ${errorDetail(error)}`);
    return EXIT_FAIL;
  }
  log("FAIL: expected __validate__ to reject, but the transaction would succeed (not submitted)");
  return EXIT_FAIL;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return EXIT_PASS;
  }
  try {
    const options = parseArgs(argv);
    const account = await connect(options);
    log(`calls: ${describeCalls(options.calls)}`);
    switch (options.expect) {
      case "success":
        return await expectSuccess(account, options);
      case "revert":
        return await expectRevert(account, options, options.reason as string);
      case "reject":
        return await expectReject(account, options);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${USAGE}`);
      return EXIT_PRECONDITION;
    }
    if (error instanceof PreconditionError) {
      log(`ERROR: ${error.message}`);
      return EXIT_PRECONDITION;
    }
    log(`ERROR: ${errorDetail(error)}`);
    return EXIT_PRECONDITION;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
