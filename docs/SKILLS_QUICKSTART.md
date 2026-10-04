# Skills Quickstart (2 Minutes)

Fastest path to a first useful result from Starknet skills: a `security-review-*.md`
report from `cairo-auditor`. The same install paths work for every skill in
[`skills/`](../skills/README.md).

Run it on your own Cairo project. If you don't have one handy, create a temporary
`.cairo` file from the [demo file instructions](../skills/cairo-auditor/README.md#no-cairo-project-handy)
and use that path instead of `path/to/your_contract.cairo`.

## 1) Codex

Option A, clone the repo (all skills are auto-discovered from `.agents/skills`):

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git && cd starknet-agentic
```

Open Codex from the repo root so discovery picks up `.agents/skills`.

Windows prerequisite: enable symlink checkout before cloning (`git config --global core.symlinks true`) and enable Developer Mode (or elevated privileges), then clone or re-clone.

Option B, install one skill from GitHub:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
python3 "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo keep-starknet-strange/starknet-agentic \
  --path skills/cairo-auditor \
  --ref main
```

Restart Codex and open `/skills`. For an immutable install, replace `main` with a commit SHA you trust.

Prompt:

```text
Run cairo-auditor on path/to/your_contract.cairo with --file-output.
Output only the final report.
Report only concrete exploitable issues with severity and file:line references.
```

## 2) Claude Code

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
/reload-plugins
```

Marketplace installs resolve published bundle metadata, not a Git ref.

Prompt:

```text
/starknet-agentic-skills:cairo-auditor path/to/your_contract.cairo --file-output
Output only the final report with severity, exploit path, and patch guidance.
```

### Install scope

| Scope | Command | When to use |
|---|---|---|
| User (recommended) | `/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user` | Daily workflow, one install for all repos |
| Local | `/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local` | Pin a repo to a specific plugin state |

If both scopes exist and skill resolution is inconsistent, remove the local scope and keep user scope:

```bash
/plugin uninstall starknet-agentic-skills@starknet-agentic-skills --scope local
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
/reload-plugins
```

## 3) Agent Skills CLI (skill-hosted runtimes)

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor
```

This command is not pinned to a Git ref.

Prompt (in your host after install):

```text
Use cairo-auditor on path/to/your_contract.cairo with --file-output.
Output only the final report.
Only include defensible findings with file:line references.
```

## Verify the result

- The skill loads in your host and the run completes without tool/runtime errors.
- `./security-review-*.md` exists and includes, per finding:
  - severity (`P0`..`P3`)
  - vulnerability class
  - file and line reference
  - actionable remediation guidance

## Compatibility Matrix

Verification recency is published on each site build in `starkskills.org/data/site-data.json` (`generated_at_utc`).

| Surface | Status | Install Path |
|---|---|---|
| Codex | Supported | `.agents/skills` auto-discovery from repo root, or the GitHub skill installer |
| Claude Code | Supported | Plugin marketplace bundle (`--scope user` recommended) |
| Agent Skills CLI | Supported | `npx skills add ...` |
| Other Agent Skills hosts (Cursor, Copilot, Roo, Windsurf, Goose) | Not verified here | Agent Skills CLI import flow |

## Troubleshooting Matrix

Install, scope, cache, and sync problems are covered in the skills recovery matrix:
[`skills/TROUBLESHOOTING.md`](../skills/TROUBLESHOOTING.md).

## Next steps

- Pick other skills from the catalog: [`skills/README.md`](../skills/README.md)
- Build or run agents from source: [`GETTING_STARTED.md`](./GETTING_STARTED.md)
