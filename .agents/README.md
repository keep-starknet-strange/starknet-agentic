# Codex Skill Entry Points

This directory exposes repository skills through Codex's `.agents/skills` discovery path.

- Canonical skill content remains under `skills/<name>/`.
- `.agents/skills/<name>` entries are symlinks to canonical skills.
- Keep symlinks aligned with `skills/manifest.json` and `skills/*/SKILL.md`.

If a skill is added or removed, update symlinks and run:

```bash
python3 scripts/quality/check_codex_distribution.py
python3 -m unittest scripts/quality/test_codex_distribution.py
```
