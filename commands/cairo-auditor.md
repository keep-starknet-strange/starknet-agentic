---
description: Run the Cairo auditor workflow (alias for starknet-agentic-skills:cairo-auditor)
argument-hint: [deep|<file...>] [--file-output]
allowed-tools: [Read, Glob, Grep, Bash, Task, Agent]
---

# Cairo Auditor

Run the bundled `cairo-auditor` skill from this plugin.

Arguments passed by user:
`$ARGUMENTS`

## Behavior

1. Invoke the installed skill `starknet-agentic-skills:cairo-auditor`.
2. Forward `$ARGUMENTS` exactly as provided.
3. Keep the skill's existing mode semantics:
   - no args: default full-repo scan
   - `deep`: adversarial/deep mode
   - file paths: targeted scan for explicit files
   - `--file-output`: write report file in addition to terminal output
4. If the namespaced invocation is unavailable in this session, retry with the short form `cairo-auditor`.

## Quick Examples

- `/cairo-auditor`
- `/cairo-auditor deep`
- `/cairo-auditor src/contracts/vault.cairo`
- `/cairo-auditor src/contracts/vault.cairo --file-output`
