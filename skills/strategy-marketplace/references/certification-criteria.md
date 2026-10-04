# Certification Criteria

Strategy listings are marked `certified` when:

1. `totalGames >= 10`
2. `avgRoi > 0`
3. `wins / totalGames > 0.5`

These rules are enforced inside `publishStrategy` and can be tightened later
without changing external call shapes.
