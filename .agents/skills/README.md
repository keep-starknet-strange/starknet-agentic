# Codex Skill Discovery

This directory provides Codex auto-discovery entries.

Each entry is a symlink to the canonical skill directory in `skills/`.
Do not edit files through this folder; edit the canonical paths under `skills/`.

Windows note:
- Git on Windows may checkout symlinks as plain text files unless symlink support is enabled.
- Before cloning, run `git config --global core.symlinks true` and ensure Windows Developer Mode (or elevated privileges) is enabled.
