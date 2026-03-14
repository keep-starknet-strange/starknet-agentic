# INPUT_BOUND_VALIDATION

Apply this pattern to user/config-provided numeric parameters:

1. Define canonical constants (`MIN`, `MAX`).
2. Validate bounds at public entrypoint.
3. Fail with explicit error code.
4. Propagate only validated values into constructor/internal calls.
5. Add boundary tests (`MIN-1`, `MIN`, `MAX`, `MAX+1`).
