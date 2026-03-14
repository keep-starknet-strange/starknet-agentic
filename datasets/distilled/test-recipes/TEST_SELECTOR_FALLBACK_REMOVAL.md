# TEST_SELECTOR_FALLBACK_REMOVAL

- Simulate external call failure for token helper.
- Assert helper reverts directly.
- Assert no alternate selector syscall is attempted in reverted path.
- Add static check forbidding `result.is_err()` selector retries in onchain helper code.
