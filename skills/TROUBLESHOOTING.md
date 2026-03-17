# Skills Install and Runtime Troubleshooting

This matrix covers the common failure classes: auth, quota, install, and sync.

## Recovery Matrix

| Class | Symptom | Recovery Commands |
| --- | --- | --- |
| Auth | GitHub access error while installing from URL | `gh auth status` then `gh auth login` |
| Auth | Claude marketplace install fails due auth/session | `/plugin menu` then `/plugin marketplace add keep-starknet-strange/starknet-agentic` |
| Quota | Claude run stops with usage limit message | `/usage` then retry with default mode (not deep) |
| Install | Codex skill not visible after install | Re-run `skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor`, then restart Codex and open `/skills` |
| Install | Claude plugin installed but commands unavailable | `/plugin list`, `/reload-plugins`, `/plugin update starknet-agentic-skills@starknet-agentic-skills` |
| Install | Agent Skills CLI install appears stale | `npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor --force` |
| Sync | Marketplace metadata changed but local plugin stale | `/plugin marketplace update keep-starknet-strange/starknet-agentic`, `/plugin update starknet-agentic-skills@starknet-agentic-skills`, `/reload-plugins` |
| Sync | Local clone missing latest skill refs/scripts | `git fetch origin && git checkout main && git pull --ff-only origin main` |

## Claude Scope Selection

Recommended default:

```bash
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local
```

Global install (all projects):

```bash
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
```

## Reproducible Pin Policy

Use immutable refs in public docs and benchmark runs:

- release tag: `v0.1.0-beta.1`
- or commit SHA when testing an unreleased change

Pin example:

```bash
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/v0.1.0-beta.1/skills/cairo-auditor
```
