# Update Website Documentation

This command updates the website documentation to reflect all changes made to the starknet-agentic repository since the last documentation update.

## Execution Steps

### Step 1: Get the Last Documentation Update Commit

Read `website/CLAUDE.md` and extract the commit hash from the `docs-last-updated` field at the end of the file. This is your baseline commit.

### Step 2: Analyze All Changes Since Baseline

Run the following to get all changes since the last docs update:

```bash
git log --oneline <baseline_commit>..HEAD
git diff --stat <baseline_commit>..HEAD
```

**CRITICAL: Do NOT rely on commit messages or summaries.** You MUST:
1. Read the actual changed files to understand what changed
2. Explore the codebase to understand the current state of interfaces, APIs, and functionality
3. Compare against what the documentation currently says

Use the Task tool with `subagent_type=Explore` to thoroughly research:
- Changes to MCP server tools (packages/starknet-mcp-server/)
- Changes to Cairo contracts (contracts/erc8004-cairo/, contracts/agent-account/, contracts/huginn-registry/)
- Changes to skills (skills/)
- Changes to examples (examples/)
- Changes to packages (packages/)
- Any new features, interfaces, or breaking changes

### Step 3: Identify Documentation Gaps

Compare your findings against the existing documentation in `website/content/docs/`.

Documentation pages are defined in `website/app/data/docs.ts` and content lives in `website/content/docs/{category}/{slug}.mdx`.

Categories:
- `getting-started/` - Introduction, installation, quick-start, configuration
- `guides/` - Wallet management, MCP server, DeFi operations, agent identity
- `skills/` - Individual skill documentation
- `contracts/` - ERC-8004 contract documentation
- `api-reference/` - MCP tools, A2A protocol, SDK methods

### Step 4: Update Existing Documentation

For each piece of documentation that needs updating:

**IMPORTANT RULES:**
- NEVER add historical notes like "In commit xyz...", "Previously this...", "Now this does..."
- NEVER preserve a changelog or history in the docs
- Documentation should describe WHAT EXISTS NOW
- Write as if the docs were just written for the first time today
- Remove any outdated information completely
- Update code examples to reflect current APIs and interfaces

Make edits using the Edit tool to update the MDX files.

### Step 5: Propose New Documentation Pages

If changes exist that are outside the scope of current documentation:

1. List the new functionality/features that need documentation
2. Propose new page titles and which category they belong to
3. Use the AskUserQuestion tool to get approval before creating new pages:

```
Question: "The following new pages need to be added to document recent changes. Approve creation?"
Options:
- "Yes, create all proposed pages"
- "Let me review and select which to create"
- "Skip new pages for now"
```

If approved, create new pages by:
1. Adding entries to `website/app/data/docs.ts`
2. Creating MDX files in `website/content/docs/{category}/{slug}.mdx`

### Step 6: Request User Review

After all documentation updates are complete, use AskUserQuestion:

```
Question: "Documentation updates complete. Please review the changes and confirm they look good."
Options:
- "Changes look good, proceed with commit"
- "I need to make some manual edits first"
```

### Step 7: Commit and Update Tracking

Only after user confirms everything is good:

1. Stage and commit all documentation changes (excluding CLAUDE.md):
```bash
git add website/app/data/docs.ts website/content/docs/
git commit -m "docs(website): update documentation using the update-docs command

<summary of changes>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

2. Get the new commit hash:
```bash
git rev-parse HEAD
```

3. Update the `docs-last-updated` field in `website/CLAUDE.md` with the new commit hash

4. Make a separate commit for the CLAUDE.md tracking update (do NOT amend):
```bash
git add website/CLAUDE.md
git commit -m "chore(website): update docs-last-updated tracking field

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Note:** We use a separate commit instead of amending because amending changes the commit hash, creating a chicken-and-egg problem where the hash in CLAUDE.md would never match the final commit.

## Documentation Style Guidelines

When writing or updating documentation:

- Use MDX format with available components: `Callout`, `Collapsible`, `FAQItem`, `Steps`, `Step`, `QuickStartChecklist`
- Code examples should use TypeScript with proper syntax highlighting
- Include practical examples that users can copy and modify
- Keep explanations concise and technical
- Use tables for API parameters and configuration options
- Cross-reference related documentation pages where helpful

## Available MDX Components

```mdx
<Callout type="info|warning|error">
  Important information here.
</Callout>

<Steps>
  <Step title="Step 1">
    First step content.
  </Step>
  <Step title="Step 2">
    Second step content.
  </Step>
</Steps>

<Collapsible title="Click to expand">
  Hidden content here.
</Collapsible>
```
