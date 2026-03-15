# Starkskills Static Site

Static site generator for `starkskills.org` (catalog + vuln card browser).

## Usage

From repo root:

```bash
python3 scripts/starkskills_site/build_site.py \
  --domain starkskills.org \
  --output-dir starkskills-site
```

Optional link-target overrides (for tags/preview refs):

```bash
python3 scripts/starkskills_site/build_site.py \
  --domain starkskills.org \
  --repo-slug keep-starknet-strange/starknet-agentic \
  --repo-ref main \
  --output-dir /tmp/starkskills-site-preview
```

Output files:

- `starkskills-site/index.html`
- `starkskills-site/vuln-cards/index.html`
- `starkskills-site/data/site-data.json`
- `starkskills-site/CNAME` (when `--domain` is supplied)

The generator reads source-of-truth data from:

- `datasets/**` and `evals/**` for corpus metrics
- `.claude-plugin/plugin.json` + `skills/manifest.json` for skill discovery
- root `SKILL.md` (or fallback `skills/SKILL.md`) for router linking

Production checks are built in:

- fails fast when required datasets/manifests are missing
- validates generated skill URLs include `/skills/`
- rejects stale legacy `starknet-skills` links when building `starknet-agentic`
