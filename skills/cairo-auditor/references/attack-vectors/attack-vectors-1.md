# Cairo Attack Vectors (1/4): Access Control + Upgradeability

> **D:** Detection pattern — what makes this vector dangerous.
> **FP:** False-positive caveat — when this pattern is actually safe.

**1. Immediate upgrade without delay**
- **D:** privileged `upgrade` path calls `replace_class_syscall` or `upgradeable.upgrade` in one transaction with no schedule/execute split.
- **FP:** explicit timelock state with pending hash and `now >= scheduled + delay` check.

**2. Missing class-hash non-zero guard (direct syscall path)**
- **D:** direct `replace_class_syscall(new_class_hash)` without `is_non_zero` guard.
- **FP:** local guard exists or call goes through OZ `UpgradeableComponent` internal guard.

**3. Constructor critical role without non-zero guard**
- **D:** constructor writes `owner/admin/upgrade/governor` directly with no non-zero validation.
- **FP:** explicit constructor guard or trusted initializer with proven internal non-zero check.

**4. Irrevocable privileged role**
- **D:** privileged role seeded at deploy time with no reachable rotate/revoke path.
- **FP:** exposed ownership/role rotation path exists (for example Ownable transfer or AccessControl grant/revoke).

**5. One-shot registration of critical dependency**
- **D:** `register_*` write-once gate sets critical dependency and no recovery setter exists (ForgeYields-style risk).
- **FP:** documented immutable dependency or owner/governance recovery path exists.

**6. Ungated privileged mutation**
- **D:** external `set_*`, `register_*`, `upgrade*`, or pause path mutates privileged state without caller gate.
- **FP:** strict access check in-path (`assert_only_*`, role check, or explicit caller assertion).

**7. Caller alias bypass in access checks**
- **D:** caller stored in alias and compared to wrong role slot or stale authority field.
- **FP:** alias resolves to correct authority source tied to the same function path.

**8. External ABI mutation hidden behind helper**
- **D:** externally callable function delegates to helper that mutates privileged state; entrypoint lacks auth.
- **FP:** helper or parent enforces strict auth with no bypass path.

**9. Upgrade path reachable from broad role**
- **D:** upgrade guarded by overly broad role set (for example generic admin role with many holders).
- **FP:** dedicated upgrade role with constrained grant/revoke controls.

**10. Upgrade initializer omission**
- **D:** class replacement leaves migration state uninitialized, enabling unsafe defaults.
- **FP:** migration is atomically executed or new class is migration-free by design and documented.

**11. Mixed ownership models with orphan authority**
- **D:** contract uses both Ownable and AccessControl; privileged paths depend on stale model.
- **FP:** single authority model or explicit synchronization between models.

**12. Emergency controls not actually privileged**
- **D:** `pause`, `unpause`, or `emergency_*` paths callable through weak predicate.
- **FP:** dedicated emergency role, explicit gate, and no user-facing bypass.

**13. Timelock bypass through alternate upgrade entrypoint**
- **D:** one upgrade path enforces delay while another admin path upgrades immediately.
- **FP:** all upgrade routes converge on a shared timelock gate.

**14. Role-admin misconfiguration enables privilege escalation**
- **D:** `set_role_admin` ties sensitive role admin to itself or user-controlled role without constraints.
- **FP:** role hierarchy maps to governance/owner-only admin chain.

**15. Upgrade auth delegated to mutable external contract**
- **D:** upgrade permission depends on external contract state that can be swapped or desynced.
- **FP:** external dependency is immutable or integrity-checked per call.

**16. Initializer re-entry / double-init path**
- **D:** initializer callable more than once or callable post-deploy by non-trusted party.
- **FP:** initialized flag and strict deploy-time only gate prevent re-entry.

**17. Factory dependency validation missing on one constructor branch**
- **D:** multi-branch init validates non-zero dependencies on one branch but not another.
- **FP:** all constructor/init branches apply identical dependency checks.

**18. Role revocation impossible after bootstrap**
- **D:** privileged role granted in constructor but no external revoke flow (common mis-embed of AccessControl).
- **FP:** role management ABI (`grant/revoke/renounce`) is exposed and reachable.

**19. Pause bypass via equivalent state-mutating function**
- **D:** deposits/transfers are paused, but equivalent state-changing route remains open.
- **FP:** pause invariant enforced at shared internal gate for all equivalent routes.

**20. Admin transfer lockout edge**
- **D:** admin transfer path allows zero/self/inconsistent target and can lock governance flows.
- **FP:** transfer validates target and preserves recoverability guarantees.

**81. Mixed authority drift between Ownable and AccessControl**
- **D:** one privileged path checks Ownable while another checks role state, enabling desynced authority.
- **FP:** single authority model or explicit sync invariant across both models.

**82. Mutable timelock-delay downgrade**
- **D:** governance can set timelock delay to zero (or near-zero) and immediately execute privileged action.
- **FP:** delay changes are themselves timelocked with minimum floor enforcement.

**83. Schedule cancellation by lower privilege**
- **D:** pending upgrade/action can be canceled by role that cannot schedule/execute it.
- **FP:** cancellation privilege is equal or stricter than scheduling privilege.

**84. Pending upgrade overwrite race**
- **D:** new pending class hash overwrites existing schedule without explicit cancellation workflow.
- **FP:** overwrite blocked unless prior schedule is canceled/expired.

**85. Library-call governance bypass**
- **D:** privileged flow uses `library_call` path controlled by mutable class hash/registry.
- **FP:** class hash is immutable or strictly timelocked and allowlisted.

**86. Upgrade without initializer version guard**
- **D:** post-upgrade initializer can be replayed because version/init slot is not advanced.
- **FP:** initializer versioning is monotonic and replay-safe.

**87. Caller source confusion in auth check**
- **D:** auth compares wrong caller source (`get_tx_info` account vs `get_caller_address`) for path semantics.
- **FP:** caller primitive matches the actual trust boundary of the entrypoint.

**88. Role grant seeds invalid principal**
- **D:** grant/seed path accepts zero or malformed principal for critical role.
- **FP:** role grant validates non-zero and expected principal domain.

**89. Pause gate bypass via alias entrypoint**
- **D:** one selector is paused while an equivalent alias/casing path remains active.
- **FP:** shared pause gate covers all equivalent privileged/state-mutating routes.

**90. Internal privileged helper exposed externally**
- **D:** helper intended for privileged internal use is reachable through unguarded external wrapper.
- **FP:** every external wrapper enforces the same auth invariant as the helper contract.

**121. Constructor assumes deployer role without explicit grant**
- **D:** constructor logic assumes deployer already holds a specific role (governor, admin) without granting it, causing post-deploy auth failures or requiring external setup.
- **FP:** role is explicitly granted in constructor or documented as a pre-deployment requirement with verified setup script.

**122. Ownership transfer to non-deployed or zero-class contract**
- **D:** `transfer_ownership` or admin transfer accepts any `ContractAddress` without validating the target is a deployed contract or non-zero.
- **FP:** transfer validates target is non-zero and optionally confirms deployment via class hash check.

**123. Forced shutdown override precedence inversion**
- **D:** contract has inferred mode plus forced/shutdown override, but inferred-mode branch returns early before forced override check, leaving critical paths active when forced shutdown is set.
- **FP:** forced override is checked first (or centralized) before any inferred-mode branch logic.

**124. Extension or module parity failure on new capability**
- **D:** new state override or mode (e.g., overwrite shutdown) implemented in core but not propagated to extension/oracle/adapter modules that also enforce the same state.
- **FP:** all extensions implement or delegate to the same capability surface as core.

**125. Non-atomic upgrade-then-configure race window**
- **D:** upgrade (`replace_class_syscall`) and post-upgrade configuration happen in separate transactions, creating a window where new code runs with stale config.
- **FP:** upgrade and migration are atomic (same transaction) or new class is backward-compatible by design.

**126. Multi-sig threshold set below safe minimum**
- **D:** multi-sig or quorum threshold can be set to zero or one, allowing single-signer execution of privileged actions.
- **FP:** threshold setter enforces minimum floor (e.g., `threshold >= 2`) or is immutable.

**127. Factory-deployed contract inherits deployer privilege**
- **D:** factory deploys child contracts that inherit factory address as admin/owner, but factory itself has broad access or is upgradeable.
- **FP:** child contracts use explicit admin parameter independent of factory, or factory is immutable with constrained interface.

**128. Upgrade migration resets or drops permission state**
- **D:** post-upgrade migration overwrites or fails to carry forward role/permission mappings from previous class, silently dropping access control state.
- **FP:** migration explicitly preserves or re-validates all permission state, with post-migration invariant checks.

**129. Self-revocation of sole admin locks governance**
- **D:** sole admin can call `revoke_role` or `renounce_ownership` on themselves with no remaining admin, permanently locking privileged functions.
- **FP:** revocation checks that at least one admin remains, or renounce requires pending transfer to be accepted first.

**130. Arbitrary declared class hash accepted without compatibility verification**
- **D:** upgrade or registry path accepts any declared class hash without validating expected interface, storage-layout compatibility, or migration invariants, allowing incompatible implementations to be installed.
- **FP:** class hash is allowlisted or validated for interface/version/storage compatibility before upgrade, with migration invariants checked explicitly.

**131. Proxy storage layout collision after class replacement**
- **D:** new implementation class uses storage slots that collide with proxy-level state (admin slot, implementation slot), corrupting proxy metadata.
- **FP:** implementation uses explicit non-overlapping Starknet storage namespaces/substorage roots and preserves proxy-reserved metadata invariants.

**132. Authorization/policy check occurs after state mutation on non-reverting error path**
- **D:** function writes critical state before auth/policy check or before a non-reverting `Err` return branch, allowing inconsistent state when the operation reports failure without transaction revert.
- **FP:** auth/policy checks execute before any state write and failure paths do not persist partial mutations.
