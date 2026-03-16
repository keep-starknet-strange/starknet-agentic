# Skills Quickstart (2 Minutes)

Use this page when you want the fastest path to a first useful output from Starknet skills.

## 1) Codex

Install:

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git && cd starknet-agentic
# Skills are auto-discovered from .agents/skills in this repo.
```

Open Codex from this repo root (`starknet-agentic`) so discovery picks up `.agents/skills`.

Run prompt:

```text
Use $cairo-auditor to audit ./contracts and report only concrete exploitable findings with file:line evidence, impact, and fix diff.
```

Expected artifact:
- A markdown finding list with severity, evidence, exploit path, and remediation snippet.

## 2) Claude Code

Install:

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills -s user
/reload-plugins
```

Run command:

```bash
/cairo-auditor contracts/src/account.cairo
```

Expected artifact:
- A focused report for the target file with actionable secure patch guidance.

## 3) Agent Skills CLI (Cursor/Copilot/Roo/Windsurf/Goose)

Install:

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor
```

Run prompt:

```text
Audit ./contracts with cairo-auditor and write findings.md with file:line, exploitability, and safe patch.
```

Expected artifact:
- `findings.md` in your workspace, suitable for PR review.

## Install Scope Guidance (Claude)

| Scope | Command | When to use |
|---|---|---|
| User (recommended) | `/plugin install starknet-agentic-skills@starknet-agentic-skills -s user` | Daily workflow, one install for all repos |
| Project | `/plugin install starknet-agentic-skills@starknet-agentic-skills -s project` | Pin a repo to a specific plugin state |

If both scopes exist and skill resolution is inconsistent, remove project scope and keep user scope only.

```bash
/plugin uninstall starknet-agentic-skills@starknet-agentic-skills -s project
/plugin install starknet-agentic-skills@starknet-agentic-skills -s user
/reload-plugins
```

## Compatibility Matrix

Last verified: **2026-03-17**

| Surface | Status | Install Path |
|---|---|---|
| Codex | Supported | `.agents/skills` auto-discovery from repo root |
| Claude Code | Supported | Plugin marketplace bundle (`-s user` recommended) |
| Agent Skills CLI | Supported | `npx skills add ...` |
| Cursor / Copilot / Roo / Windsurf / Goose | Supported via Agent Skills format | Use Agent Skills CLI import flow |

## Troubleshooting Matrix

| Problem | Why it happens | Fix |
|---|---|---|
| `Unknown skill: ...cairo-auditor` in Claude | Stale project-scope plugin overrides user scope | `/plugin uninstall starknet-agentic-skills@starknet-agentic-skills -s project` then reinstall with `-s user` and `/reload-plugins` |
| Skill not discovered in Codex | Session started outside repo root or stale discovery cache | Open Codex from repo root (`starknet-agentic`) so `.agents/skills` is indexed, then restart session |
| Install succeeds but old content remains | Cached install or old revision | Reinstall with force: `npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor --force` |
| Marketplace install works but slash command fails | Plugin registry not reloaded in active session | Run `/reload-plugins` |
| Audit output too broad/noisy | Full-repo scan on large codebase | Run path-targeted scan: `/cairo-auditor contracts/src/account.cairo` |
