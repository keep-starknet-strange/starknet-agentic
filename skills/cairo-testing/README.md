---
name: cairo-testing-readme
description: User-facing guide for the cairo-testing skill workflow and coverage requirements.
---

# cairo-testing

Write comprehensive tests for Cairo smart contracts — unit, integration, fuzz, fork, and regression.

<p>
  <img alt="mode unit" src="https://img.shields.io/badge/mode-unit-0969da" />
  <img alt="mode integration" src="https://img.shields.io/badge/mode-integration-0969da" />
  <img alt="mode fuzz" src="https://img.shields.io/badge/mode-fuzz-0969da" />
  <img alt="mode fork" src="https://img.shields.io/badge/mode-fork-0969da" />
  <img alt="mode regression" src="https://img.shields.io/badge/mode-regression-0969da" />
  <img alt="coverage rules" src="https://img.shields.io/badge/coverage%20rules-5-2ea043" />
</p>

Built for:

- **Cairo devs** adding tests to a new or existing contract
- **Teams** needing full coverage: success paths, auth failures, event assertions, edge cases
- **Anyone** turning audit findings into permanent regression tests

## Usage

```bash
# Full test coverage for a contract
/cairo-testing

# Specific requests
/cairo-testing "add fuzz tests for the deposit function"
/cairo-testing "write regression test for this access control finding"
/cairo-testing "integration tests for my ERC20 + AMM interaction"
```

## How it works

The skill orchestrates a **4-turn workflow**:

| Turn | What happens |
|------|-------------|
| **1. Understand** | Read the contract, identify all externals, find existing tests, load snforge references |
| **2. Plan** | Output test plan: functions, positive/negative paths, events, fuzz targets. Wait for confirmation. |
| **3. Implement** | Write tests following mandatory coverage rules, verify with `snforge test` |
| **4. Verify** | Walk coverage checklist, report gaps, suggest `cairo-auditor` for additional targets |

## Coverage rules (always enforced)

| # | Rule |
|---|------|
| 1 | Every storage-mutating external has both a success and a failure test |
| 2 | Every access-controlled function tested with authorized and unauthorized callers |
| 3 | Expected panics use `#[should_panic(expected: '...')]` with the exact message |
| 4 | Event assertions use `spy_events` + `assert_emitted` with full event data |
| 5 | Fuzz tests use fixed seeds (`seed: 12345`) for reproducibility |

## Example test pattern

```cairo
#[test]
fn test_transfer_succeeds() {
    let contract_address = deploy_contract();
    let dispatcher = IMyContractDispatcher { contract_address };
    let mut spy = spy_events();

    start_cheat_caller_address(contract_address, OWNER());
    dispatcher.transfer(USER(), 100);

    spy.assert_emitted(@array![
        (contract_address, MyContract::Event::Transfer(
            MyContract::Transfer { from: OWNER(), to: USER(), amount: 100 }
        ))
    ]);
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_transfer_non_owner_rejected() {
    let contract_address = deploy_contract();
    let dispatcher = IMyContractDispatcher { contract_address };

    start_cheat_caller_address(contract_address, USER());
    dispatcher.transfer(USER(), 100);  // should panic
}
```

## Structure

```text
cairo-testing/
  SKILL.md                          # 4-turn orchestration
  references/
    legacy-full.md                  # snforge API: tests, cheatcodes, fuzzing, forks (396 lines)
  workflows/
    default.md                      # 5-phase workflow reference
```

## Recommended flow

```text
cairo-contract-authoring → cairo-testing → cairo-auditor
       write                test            audit
```

## References

- Skill policy: [SKILL.md](SKILL.md)
- Workflow: [workflows/default.md](workflows/default.md)
- snforge patterns: [references/legacy-full.md](references/legacy-full.md)
