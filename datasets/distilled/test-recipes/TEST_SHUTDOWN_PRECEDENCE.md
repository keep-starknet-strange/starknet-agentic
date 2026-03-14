# TEST_SHUTDOWN_PRECEDENCE

- Configure pool with active inferred shutdown mode.
- Configure fixed/manual shutdown mode to a different value.
- Call `shutdown_status`.
- Assert result equals fixed/manual mode.
- Assert no branch returns inferred mode when override is set.
