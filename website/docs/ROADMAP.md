# Website Roadmap

Feature roadmap for the Starknet Agentic documentation website, broken into Nice-to-have, and Future phases.

> **Note:** Infrastructure features are tracked in the main `docs/ROADMAP.md`.

---

## Prompt Initialization

Hey, I am working to implement features for the Starknet Agentic website from the roadmap. Let's continue with implementing:

---

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
| **Nice to Have (v1.x)** | Q2 2026 | Interactive examples, blog, API playground |
| **Future (v2.0+)** | 2026+ | Community showcase, agent directory, tutorial series |

---

## Status Legend

- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

*Last updated: 2026-02-08*
