# FIX_MODE_PRECEDENCE

Apply this pattern to mode/state resolution functions:

1. Resolve manual override state first.
2. Return override immediately when active.
3. Resolve inferred/derived state only if override is inactive.
4. Add regression test covering both branches active simultaneously.
