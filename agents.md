# Multi-Agent Coordination -- Starknet Agentic

<purpose>
Defines how multiple AI agents coordinate when working on this repository. Use this when tasks are complex enough to benefit from delegation or parallel execution.
</purpose>

## Roles

<roles>

| Role | Responsibility | Does NOT |
|------|---------------|----------|
| **Coordinator** | Analyzes task scope, creates implementation plan, delegates subtasks, tracks progress, reviews results | Write code directly, execute builds/tests |
| **Cairo Developer** | Implements Cairo contracts, writes snforge tests, follows OpenZeppelin patterns | Deploy to networks, modify TypeScript packages |
| **TypeScript Developer** | Implements MCP tools, A2A adapter, framework extensions, writes Vitest tests | Modify Cairo contracts, deploy contracts |
| **Skills Author** | Writes and refines SKILL.md files, ensures AgentSkills spec compliance | Write implementation code, modify contracts |
| **Reviewer** | Validates code quality, checks for security issues, verifies test coverage | Implement features, make architectural decisions |

</roles>

## Delegation Protocol

<delegation>

### Phase 1: Investigation (use capable model)
1. Read the task requirements
2. Identify affected files and modules using `<implementation_status>` in CLAUDE.md
3. Check current state: what exists vs. what's TODO
4. Create a detailed plan with file paths, interface signatures, and test expectations
5. Estimate complexity (S/M/L) and identify parallelizable subtasks

### Phase 2: Execution (use efficient model)
1. Follow the plan from Phase 1 exactly
2. Implement changes in the specified files
3. Run builds and tests after each logical unit of work
4. Report blockers immediately -- do not improvise around missing context
5. Document any deviations from the plan

### Phase 3: Validation
1. Run full test suite for affected components
2. Verify no regressions in unrelated tests
3. Check that new code follows `<conventions>` in CLAUDE.md
4. Confirm `<boundaries>` are respected (no forbidden file modifications)

</delegation>

## Task Lifecycle

<task_states>

```
pending --> in_progress --> in_review --> done
                       \-> blocked
                       \-> cancelled
```

| Transition | Trigger |
|------------|---------|
| pending -> in_progress | Agent assigned, work started |
| in_progress -> in_review | Implementation complete, tests pass |
| in_progress -> blocked | Missing dependency, needs decision, or needs human input |
| in_review -> done | Review passed, merged |
| in_review -> in_progress | Review found issues, needs fixes |
| any -> cancelled | Task no longer relevant |

</task_states>

## Task Template

<task_template>

```markdown
## [Type]: [Title]

**Complexity:** S / M / L
**Component:** Cairo | TypeScript | Skills | Docs

### Problem
[1-2 sentences: what needs to be solved]

### Context
- Affected files: [list paths]
- Related spec: [reference to docs/SPECIFICATION.md section]
- Dependencies: [other tasks or components this depends on]

### Implementation Plan
1. [Step with specific file path and what to change]
2. [Step]
3. [Step]

### Acceptance Criteria
- [ ] Implementation matches spec
- [ ] Tests written and passing
- [ ] No regressions in existing tests
- [ ] Follows project conventions

### Out of Scope
- [Explicit exclusions]
```

</task_template>

## Parallel Execution Rules

<parallelization>

### Safe to parallelize
- Cairo contract work + TypeScript package work (different languages, no shared files)
- Different skills in `skills/` (independent SKILL.md files)
- MCP server tools + A2A adapter (separate packages, no shared state)
- Test writing + documentation (different file types)
- Website work + any backend work (fully independent)

### Must serialize
- Changes to the same Cairo contract file
- Changes to shared interfaces in `src/interfaces/`
- TypeScript packages that import from each other
- Any task that depends on another task's output (e.g., "implement tool" then "write test for tool")

### Conflict Resolution
1. Detect file overlap before starting parallel tasks
2. If overlap found, serialize the conflicting tasks
3. If discovered mid-execution: pause the later task, let the first complete
4. Rebase the second task's changes and verify they still apply

</parallelization>

## Component-Specific Guidance

<component_guidance>

### Cairo Contract Tasks
- Always read existing contract code before modifying (understand component embedding pattern)
- Run `snforge test` in `packages/starknet-identity/erc8004-cairo/` after every change
- New contracts: follow the IdentityRegistry pattern for structure
- Test pattern: `declare` -> `deploy` -> call via dispatcher -> assert

### MCP Server Tasks
- Read `docs/SPECIFICATION.md` Section 4 for tool definitions
- Each tool: Zod schema + handler function + registration
- Use starknet.js `RpcProvider` for reads, `Account` for writes
- Use `@avnu/avnu-sdk` for all DeFi operations (swaps, DCA, staking)
- Transport: stdio (local) + HTTP+SSE (remote)

### A2A Adapter Tasks
- Read `docs/SPECIFICATION.md` Section 5 for Agent Card generation
- Maps on-chain ERC-8004 identity to A2A Agent Cards
- Task states map to transaction states (submitted->sent, working->pending, etc.)

### Skills Tasks
- Read `references/agentskills/SPECS.md` for format requirements
- Read existing skills in `skills/` for patterns
- Frontmatter must include: name, description, keywords, allowed-tools, user-invocable
- Include starknet.js code examples with real token addresses
- Include error codes with recovery guidance

</component_guidance>

## Escalation Protocol

<escalation>

Escalate to human when:
- Task requires contract deployment (Sepolia or mainnet)
- Security vulnerability discovered in existing code
- Conflicting requirements between spec and implementation
- Need to modify protected files (`.env*`, `Scarb.lock`, git submodules)
- Breaking changes to deployed contract interfaces
- Blocked for more than 3 attempts without progress

### Escalation Format
```markdown
## Escalation: [Title]

**Task:** [reference]
**Blocker:** [what's preventing progress]

**Options:**
1. [Option A] -- [tradeoffs]
2. [Option B] -- [tradeoffs]

**Recommendation:** [which option and why]
```

</escalation>

## Common Multi-Agent Workflows

<workflows>

### Implement a New MCP Tool (2 agents)
1. **Coordinator** reads spec, creates task with tool schema and expected behavior
2. **TypeScript Developer** implements tool handler + Zod schema + registers tool
3. **TypeScript Developer** writes Vitest tests
4. **Reviewer** validates against spec and security model

### Add a New Cairo Contract (2-3 agents)
1. **Coordinator** reads spec, identifies interfaces and dependencies
2. **Cairo Developer** implements contract with OpenZeppelin components
3. **Cairo Developer** writes snforge tests (>90% coverage target)
4. **Skills Author** creates or updates related SKILL.md (parallel with step 3)
5. **Reviewer** checks security (reentrancy, access control, overflow)

### Full Feature (MCP tool + contract + skill)
1. **Coordinator** creates plan with 3 parallel tracks
2. **Cairo Developer** implements contract + tests (Track A)
3. **TypeScript Developer** implements MCP tool using contract interface (Track B, starts after Track A interface is defined)
4. **Skills Author** writes SKILL.md with usage patterns (Track C, parallel with B)
5. **Reviewer** validates all three tracks

</workflows>
