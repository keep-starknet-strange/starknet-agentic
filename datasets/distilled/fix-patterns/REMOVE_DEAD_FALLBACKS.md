# REMOVE_DEAD_FALLBACKS

When execution semantics guarantee full revert on external-call failure:

1. Remove retry/fallback branches based on `is_err()` within same tx path.
2. Keep one canonical selector name.
3. Simplify helper return path to fail-fast behavior.
4. Add tests that assert explicit revert instead of fallback.
