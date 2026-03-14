# Third-Party Skill Attribution

This file is the canonical registry for externally sourced skill content in this repository.

## Registry

| Module | Upstream Author | Upstream Source | Synced Commit | Permission / License |
| --- | --- | --- | --- | --- |
| `cairo-optimization` | [feltroidprime](https://github.com/feltroidprime) | [feltroidprime/cairo-skills](https://github.com/feltroidprime/cairo-skills) (`skills/cairo-coding`, `skills/benchmarking-cairo`) | `7fde29f` | Maintainer-confirmed permission (`permission_ref: maintainer-confirmed-2026-03-08`) |

## Required Attribution Workflow

When importing or updating third-party skills:

1. Keep `metadata.author` set to the original author.
2. Add local maintainers in `metadata.contributors`.
3. Record provenance fields in frontmatter metadata:
`upstream`, `upstream_commit`, `sync_date`, `upstream_paths`, `permission_ref`.
4. Add or update this file with module-level source and permission details.
5. Add a short attribution note at the top of imported reference docs.
6. If permission/license status changes, update this file and metadata in the same PR.
