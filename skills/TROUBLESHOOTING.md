# Skills Install and Runtime Troubleshooting

This matrix covers the common failure classes: auth, quota, install, and sync.

## Recovery Matrix

| Class | Symptom | Recovery Commands |
| --- | --- | --- |
| Auth | GitHub access error while installing from URL | `gh auth status` then `gh auth login` |
| Auth | Claude marketplace install fails due auth/session | `/plugin menu` then `/plugin marketplace add keep-starknet-strange/starknet-agentic` |
| Quota | Claude run stops with usage limit message | `/usage` then retry with default mode (not deep) |
| Install | Codex skill not visible after install | Re-run the built-in installer script with `--repo keep-starknet-strange/starknet-agentic --path skills/cairo-auditor --ref main`, then restart Codex and open `/skills` |
| Install | Claude plugin installed but commands unavailable | `/plugin list`, `/reload-plugins`, `/plugin update starknet-agentic-skills@starknet-agentic-skills` |
| Install | Claude says "already at latest" but behavior is stale | `/plugin marketplace update keep-starknet-strange/starknet-agentic`, uninstall project/local scope, reinstall with `--scope user`, then `/reload-plugins` |
| Install | Agent Skills CLI install appears stale | `npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor --force` |
| Sync | Marketplace metadata changed but local plugin stale | `/plugin marketplace update keep-starknet-strange/starknet-agentic`, `/plugin update starknet-agentic-skills@starknet-agentic-skills`, `/reload-plugins` |
| Sync | Local clone missing latest skill refs/scripts | `git fetch origin && git checkout main && git pull --ff-only origin main` |

## Claude Scope Selection

Recommended default:

```bash
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
```

Repo-pinned install (advanced):

```bash
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local
```

Hard refresh sequence (when scope collisions or stale cache are suspected):

```bash
/plugin marketplace update keep-starknet-strange/starknet-agentic
/plugin uninstall starknet-agentic-skills@starknet-agentic-skills --scope local
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
/reload-plugins
/plugin list
```

## Reproducible Pin Policy

Use immutable refs in benchmark runs and frozen installs:

- commit SHA for the exact skill revision you tested
- release tag only after the matching public tag actually exists

Pin example:

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
python3 "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo keep-starknet-strange/starknet-agentic \
  --path skills/cairo-auditor \
  --ref <commit-sha>
```
