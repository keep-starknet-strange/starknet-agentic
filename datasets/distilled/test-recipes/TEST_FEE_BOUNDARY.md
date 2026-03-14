# TEST_FEE_BOUNDARY

- Attempt pair creation with fee at max allowed value; expect success.
- Attempt pair creation with fee above max; expect revert with explicit fee error.
- Optional fuzz around boundary to ensure monotonic behavior.
