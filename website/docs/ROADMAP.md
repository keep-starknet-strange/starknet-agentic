# Website Roadmap

<<<<<<< HEAD
Feature roadmap for the Starknet Agentic documentation website, broken into MVP, Nice-to-have, and Future phases.
=======
Feature roadmap for the Starknet Agentic documentation website, broken into Nice-to-have, and Future phases.
>>>>>>> origin/main

> **Note:** Infrastructure features are tracked in the main `docs/ROADMAP.md`.

---

## Prompt Initialization

Hey, I am working to implement features for the Starknet Agentic website from the roadmap. Let's continue with implementing:

---

<<<<<<< HEAD
# Phase 1: MVP

Core website features required for v1.0 release.

---

### 1.0 Project Setup and Structure

**Description**: Ensure the Next.js 16 project has proper structure for both landing page and documentation.

**Requirements**:
- [ ] Verify Next.js 16 + React 19 + Tailwind setup
- [ ] Set up `/app` directory structure for App Router
- [ ] Configure MDX support for documentation pages
- [ ] Set up syntax highlighting for code blocks (shiki or prism)
- [ ] Configure Vercel deployment settings
- [ ] Add proper meta tags and OpenGraph images

**Implementation Notes**:
- Website exists at `website/` with Next.js 16 + React 19
- Landing page content exists, needs `/docs` section
- Use Next.js MDX for documentation (keeps everything in one app)

---

### 1.1 Documentation Section Structure

**Description**: Create the `/docs` section with navigation and content structure.

**Requirements**:
- [ ] Create `/docs` route with sidebar navigation
- [ ] Set up documentation layout component
- [ ] Implement table of contents for long pages
- [ ] Add search functionality (basic client-side or Algolia)
- [ ] Create documentation index page
- [ ] Add prev/next navigation between pages

**Implementation Notes**:
- Mirror docs/ folder structure from main repo
- Categories: Getting Started, Guides, API Reference, Contracts

---

### 1.2 Getting Started Guide

**Description**: Migrate and enhance GETTING_STARTED.md content to the website.

**Requirements**:
- [ ] Convert GETTING_STARTED.md to MDX
- [ ] Add interactive code examples (copy button, syntax highlighting)
- [ ] Create quick start checklist component
- [ ] Add video embed or GIF walkthrough
- [ ] Test all code examples work

**Implementation Notes**:
- Source: `docs/GETTING_STARTED.md`
- Focus on 5-minute quick start experience

---

### 1.3 MCP Server Documentation

**Description**: Create comprehensive MCP server documentation with API reference.

**Requirements**:
- [ ] Overview page explaining MCP and Starknet integration
- [ ] Tool reference page with all 9 implemented tools
- [ ] Each tool: description, parameters, examples, error codes
- [ ] Claude Desktop configuration guide
- [ ] Cursor/ChatGPT configuration guides
- [ ] Troubleshooting section

**Implementation Notes**:
- Source: `packages/starknet-mcp-server/`
- Include interactive "try it" examples where possible

---

### 1.4 Skills Documentation

**Description**: Create documentation for the skills marketplace.

**Requirements**:
- [ ] Skills overview and installation guide
- [ ] Individual page for each skill (wallet, mini-pay, anonymous-wallet, defi, identity)
- [ ] Writing your own skill guide
- [ ] Publishing to ClawHub guide
- [ ] Skill search/filter component

**Implementation Notes**:
- Source: `skills/*/SKILL.md`
- Render YAML frontmatter as structured data

---

### 1.5 Contract Documentation

**Description**: Document the Cairo smart contracts.

**Requirements**:
- [ ] ERC-8004 contracts overview
- [ ] IdentityRegistry API reference
- [ ] ReputationRegistry API reference
- [ ] ValidationRegistry API reference
- [ ] Agent Account contract documentation
- [ ] Deployment guides (Sepolia, Mainnet)

**Implementation Notes**:
- Source: `packages/starknet-identity/erc8004-cairo/`, `contracts/agent-account/`
- Include Cairo code examples with syntax highlighting

---

### 1.6 Landing Page Polish

**Description**: Finalize the marketing landing page.

**Requirements**:
- [ ] Hero section with clear value proposition
- [ ] Feature highlights (MCP, A2A, ERC-8004, Skills)
- [ ] Architecture diagram (interactive if possible)
- [ ] "Get Started" call-to-action buttons
- [ ] Footer with links to GitHub, docs, Discord
- [ ] Mobile responsive design verification

**Implementation Notes**:
- Landing content exists, needs polish
- Separate concern: landing (/) vs docs (/docs)

---

=======
>>>>>>> origin/main
# Phase 2: Nice to Have

Features that enhance the website but are not required for v1.0 release.

---

### 2.1 Interactive Examples

**Description**: Add interactive code playgrounds for trying examples.

**Requirements**:
- [ ] Embed Stackblitz or CodeSandbox for TypeScript examples
- [ ] Add "Run in browser" buttons to code examples
- [ ] Create pre-configured templates for common use cases
- [ ] Add testnet wallet connection for live demos

**Implementation Notes**:
- Requires Starknet wallet integration (starknet-react)
- Consider security for testnet-only features

---

### 2.2 Blog/Changelog Section

**Description**: Add a blog section for announcements and tutorials.

**Requirements**:
- [ ] Create `/blog` route
- [ ] Set up MDX for blog posts
- [ ] Add RSS feed
- [ ] Integrate with auto-generated CHANGELOG
- [ ] Add author profiles

**Implementation Notes**:
- Can use same MDX infrastructure as docs
- Changelog auto-generation depends on main repo setup

---

### 2.3 API Playground

**Description**: Interactive API playground for testing MCP tools.

**Requirements**:
- [ ] Create tool explorer interface
- [ ] Allow parameter input and preview
- [ ] Show request/response format
- [ ] Support testnet execution (with wallet)
- [ ] Display transaction results

**Implementation Notes**:
- Similar to Swagger UI but for MCP tools
- Requires careful security considerations

---

### 2.4 Version Selector

**Description**: Support multiple documentation versions.

**Requirements**:
- [ ] Version dropdown in navigation
- [ ] Route structure: `/docs/v1.0/`, `/docs/v1.1/`
- [ ] Version warning banner for outdated docs
- [ ] "Latest" redirect
- [ ] Version comparison page

**Implementation Notes**:
- Only needed once we have breaking changes
- Can defer until v1.1

---

# Phase 3: Future

Long-term website features.

---

### 3.1 Community Showcase

**Description**: Showcase community-built agents and projects.

**Requirements**:
- [ ] Project submission form
- [ ] Gallery of featured projects
- [ ] Integration with GitHub for project metadata
- [ ] Upvoting/starring system
- [ ] Category filtering

**Implementation Notes**:
- Requires moderation workflow
- Consider using GitHub Discussions as backend

---

### 3.2 Agent Directory

**Description**: Live directory of registered agents on Starknet.

**Requirements**:
- [ ] Query ERC-8004 IdentityRegistry on-chain
- [ ] Display agent profiles with metadata
- [ ] Search and filter by capabilities
- [ ] Reputation scores and validation status
- [ ] Link to agent A2A endpoints

**Implementation Notes**:
- Requires starknet.js integration
- Consider caching for performance

---

### 3.3 Tutorial Series

**Description**: Step-by-step tutorial series for building agents.

**Requirements**:
- [ ] "Build Your First Agent" multi-part tutorial
- [ ] "DeFi Agent Deep Dive" based on defi-agent example
- [ ] "Identity and Reputation" tutorial
- [ ] Video companion content
- [ ] Progress tracking for users

**Implementation Notes**:
- High effort, high value
- Consider partnering with content creators

---

## Implementation Priority Summary

| Phase | Target | Key Deliverables |
|-------|--------|------------------|
<<<<<<< HEAD
| **MVP (v1.0)** | Q1 2026 | Docs section, getting started, MCP reference, skills docs |
=======
>>>>>>> origin/main
| **Nice to Have (v1.x)** | Q2 2026 | Interactive examples, blog, API playground |
| **Future (v2.0+)** | 2026+ | Community showcase, agent directory, tutorial series |

---

## Status Legend

- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

<<<<<<< HEAD
*Last updated: 2026-02-06*
=======
*Last updated: 2026-02-08*
>>>>>>> origin/main
