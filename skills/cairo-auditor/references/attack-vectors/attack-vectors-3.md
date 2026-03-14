# Cairo Attack Vectors (3/4): Math + Pricing + Economic Logic

**41. Unchecked fee bound**
- **D:** external/config fee parameter stored or forwarded without explicit max bound.
- **FP:** same-path assertion enforces max fee.

**42. Fee recipient zero-address DoS**
- **D:** fee recipient accepted as zero and later transfer path reverts permanently (ForgeYields-style risk).
- **FP:** recipient validated non-zero or transfer path handles zero safely.

**43. Rounding bias against one side**
- **D:** repeated rounding direction systematically favors protocol/one actor over time.
- **FP:** bias is documented, bounded, and validated by invariants.

**44. Felt/int boundary misuse**
- **D:** implicit felt<->u* conversion in accounting without range checks.
- **FP:** checked conversion and bounded domain assertions.

**45. Underflow guarded only by assumptions**
- **D:** subtraction in accounting path lacks explicit `amount <= balance` check.
- **FP:** invariant or guard enforces safe subtraction precondition.

**46. Oracle trust concentration**
- **D:** single role controls critical pricing/AUM with weak or absent second-layer limits.
- **FP:** independent caps, delay, quorum, or circuit-breakers constrain updates.

**47. Fee-share dilution drift**
- **D:** repeated fee-mint formula introduces systematic dilution beyond intended policy.
- **FP:** fee accrual invariants bound drift and match policy math.

**48. Boundary double-spend across period reset**
- **D:** hard-window reset permits max spend just before and after boundary.
- **FP:** sliding window or explicit boundary hardening.

**49. Zero-amount side-effect call**
- **D:** zero-value `approve/transfer` or policy call still changes privileges or approvals.
- **FP:** zero-value side-effecting selectors are blocked.

**50. Denominator stabilization hack leakage**
- **D:** ad-hoc `+1` denominator/sentinel math leaks value over repeated operations.
- **FP:** mathematically justified stabilization with bounded error tests.

**51. Multi-token spending-policy mismatch**
- **D:** policy accounting binds to one token while selectors can move others.
- **FP:** selector gate enforces same token domain as spending policy.

**52. Repricing path bypasses caps**
- **D:** cap checked on one update path but bypassed through alternate report/settlement path.
- **FP:** shared invariant enforced for every repricing entrypoint.

**53. Division-before-multiplication precision loss**
- **D:** integer division happens before scaling multiply in value-sensitive calculations.
- **FP:** multiply-then-divide with overflow-safe helper is used.

**54. WAD/RAY scale mismatch across modules**
- **D:** mixed precision units combined without explicit conversion.
- **FP:** explicit scale conversion and tests across module boundaries.

**55. Signed/unsigned tick or price cast hazards**
- **D:** unchecked cast between signed tick and unsigned storage value.
- **FP:** bounds checks and safe cast wrappers enforce domain.

**56. Slippage guard missing on liquidity ops**
- **D:** add/remove liquidity path lacks min-out/max-in assertions.
- **FP:** slippage constraints validated on all liquidity-changing routes.

**57. Comparator misuse in bounds validation**
- **D:** wrong comparator helper (`is_le`-style misuse seen in Cartridge audit class) accepts invalid range.
- **FP:** comparator semantics explicitly tested on edge values.

**58. Price bound mismatch with decimal scaling**
- **D:** price limit compared in different decimal domains.
- **FP:** both operands normalized to the same precision before comparison.

**59. Reward distribution overcounts due stale accumulator**
- **D:** distribution uses stale accumulator snapshot after state changed.
- **FP:** accumulator is refreshed before every distribution computation.

**60. Epoch settlement can be blocked by negative/overflow edge**
- **D:** settlement path panics on signed-edge value and blocks epoch close.
- **FP:** settlement branch handles signed edge and remains progress-safe.

**101. Liquidation bonus rounding inversion**
- **D:** liquidation reward math rounds in favor of liquidator when policy requires protocol/user protection.
- **FP:** rounding direction is explicit, documented, and invariant-tested.

**102. Cap check after value mint/accounting mutation**
- **D:** mint/accounting state is updated before cap/limit assertion executes.
- **FP:** cap/limit validation is enforced prior to state mutation.

**103. Interest accrual uses stale timestamp snapshot**
- **D:** accrual math reuses stale/cached timestamp state (or validation-phase rounded timestamp) instead of refreshing execution-phase time at accounting boundary.
- **FP:** accrual reads execution-phase timestamp fresh at settlement/accounting boundary and tests validation-vs-execution semantics.

**104. BPS denominator mismatch**
- **D:** one path uses `10_000` while another uses alternate denominator for same fee/rate domain.
- **FP:** denominator constant is shared and tested across all rate paths.

**105. Signed funding-rate clamp asymmetry**
- **D:** positive and negative funding bounds are clamped differently, creating directional leakage.
- **FP:** symmetric clamp policy with explicit signed-bound tests.

**106. Batch update bypasses cumulative delta guard**
- **D:** per-item delta checks pass while aggregate batch delta exceeds policy limit.
- **FP:** both per-item and cumulative deltas are enforced.

**107. Decimal normalization source mismatch**
- **D:** normalization uses one asset's decimals for another asset path.
- **FP:** each asset path resolves and validates its own decimal domain.

**108. Multiply chain overflow before safe divide**
- **D:** high-order multiply happens before overflow-safe divide/cast boundary.
- **FP:** operation ordering or helpers ensure overflow-safe intermediate math.

**109. Timestamp/block-number domain confusion**
- **D:** staleness/expiry check compares timestamp-based values to block-number domain.
- **FP:** freshness checks are domain-consistent and unit-tested.

**110. Reciprocal pricing missing zero/underflow guards**
- **D:** inverse price math executes without zero-floor and bound checks.
- **FP:** reciprocal path validates non-zero numerator/denominator and bounds.

**145. Felt252 range violation via unbounded parameter**
- **D:** parameter passed to cryptographic function, bit operation, or storage derivation is not bounds-checked against safe range below felt252 field prime, enabling wrap-around or invalid proof inputs.
- **FP:** explicit range assertion (e.g., `value < 2^64`, `bit_size < 252`) enforced before use.

**146. Modulo arithmetic edge case causing index wrap or overwrite**
- **D:** index derived via modulo (`value % CAPACITY`) wraps to a previously used slot, overwriting pending state (e.g., root history ring buffer).
- **FP:** modulo-derived index checked for collision with occupied slot, or monotonic index prevents overwrite.

**147. Collected fee balance stuck with no withdrawal mechanism**
- **D:** contract collects fees (transfer-in on operations) but exposes no function to withdraw accumulated fee balance, permanently locking funds.
- **FP:** dedicated fee withdrawal function exists with appropriate access control.

**148. Fee hook or callback always reverts blocking operation**
- **D:** fee collection path delegates to hook/callback that unconditionally reverts (wrong interface, missing implementation, or incorrect return value), blocking all fee-bearing operations.
- **FP:** fee hook is validated at registration or has a bypass/fallback for misconfigured hooks.

**149. First-depositor vault share inflation attack**
- **D:** first depositor mints minimal shares then donates assets directly, inflating share price so subsequent depositors receive zero shares for non-trivial deposits.
- **FP:** vault enforces minimum initial deposit, uses virtual shares/assets offset, or dead shares mechanism.

**150. Instruction sequence interaction causing negative balance state**
- **D:** specific combination of batch instructions (borrow + swap + repay) creates intermediate negative balance that either reverts unexpectedly or underflows storage.
- **FP:** batch executor validates intermediate invariants between instructions, or instruction ordering is constrained.

**151. Staking reward front-run by new depositor before checkpoint**
- **D:** reward distribution checkpoint occurs after new stake is recorded, allowing just-in-time depositor to claim share of pending rewards without contributing to the earning period.
- **FP:** checkpoint/accumulator updated before new stake is recorded, or time-weighted distribution prevents instantaneous dilution.

**152. Cross-market timestamp-key alias contaminates accrual state**
- **D:** two market/reward streams resolve to the same timestamp storage key (aliasing bug), so updates in one stream silently mutate accrual baseline of another.
- **FP:** each stream has a unique storage key namespace and invariant tests prove no cross-market key aliasing.

**153. Route-level slippage check omitted despite per-leg checks**
- **D:** each leg in a batched route satisfies local min/max checks, but no final route-level min-out/slippage assertion is enforced at settlement, allowing harmful composite paths.
- **FP:** protocol enforces both per-leg checks and a final route-level aggregate slippage/invariant check.

**154. Emergency withdrawal fails due to insufficient contract balance**
- **D:** emergency withdrawal path assumes contract holds sufficient assets, but partial withdrawals or external drains leave insufficient balance, causing revert when users need funds most.
- **FP:** emergency path handles partial fulfillment or has priority claim mechanism with clear accounting.

**155. Deficit handling branch reachable but debt accounting not persisted**
- **D:** settlement reaches the deficit/socialization path but fails to persist updated debt/socialization state before exit, causing repeated deficit handling or inconsistent recovery accounting.
- **FP:** deficit branch atomically persists debt/socialization state and integration tests cover consecutive negative-settlement cycles.

**156. Fee override path bypasses canonical normalization**
- **D:** primary setter normalizes fee inputs correctly, but admin/import/override path writes raw fee values directly, letting consumers apply mixed-scale state.
- **FP:** every fee write path goes through the same normalization helper, and override/import routes are tested against the canonical stored unit.
