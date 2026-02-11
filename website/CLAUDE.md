# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Documentation website for Starknet Agentic built with Next.js 16, React 19, and Tailwind CSS. Uses MDX for documentation content with syntax highlighting via Shiki.

## Commands

| Task | Command |
|------|---------|
| Install dependencies | `pnpm install` |
| Start dev server | `pnpm dev` |
| Build for production | `pnpm build` |
| Start production server | `pnpm start` |
| Run ESLint | `pnpm lint` |

## Architecture

### Directory Structure

```
app/
├── components/
│   ├── docs/           # Documentation components (sidebar, search, pagination, callouts)
│   ├── Hero/           # Landing page hero section
│   ├── Navbar/         # Navigation (desktop + mobile)
│   ├── sections/       # Landing page sections (Vision, FeaturedApps, Architecture, etc.)
│   └── ui/             # Reusable UI components (cards, badges)
├── data/               # Static data with TypeScript types
├── docs/               # Documentation pages (uses [category]/[slug] dynamic routing)
└── hooks/              # Custom React hooks
content/
└── docs/               # MDX documentation files organized by category
lib/
├── mdx.ts              # MDX file loading utilities
└── mdx-components.tsx  # Custom MDX component mappings
```

### Documentation System

Documentation uses a two-layer system:
1. **`app/data/docs.ts`** - Defines categories and page metadata (titles, descriptions, slugs)
2. **`content/docs/{category}/{slug}.mdx`** - Actual MDX content files

The dynamic route at `app/docs/[category]/[slug]/page.tsx` renders MDX content via `next-mdx-remote/rsc`. If an MDX file doesn't exist for a page defined in `docs.ts`, a "Coming Soon" placeholder is shown.

### Path Aliases

- `@/*` → `./app/*`
- `@/lib/*` → `./lib/*`

## Styling Conventions

### Design System: Neo-brutalist

Uses a neo-brutalist design system defined in `tailwind.config.ts`:

**Colors:**
- `cream` - Background (#FFFBEB)
- `neo-yellow`, `neo-pink`, `neo-purple`, `neo-blue`, `neo-green`, `neo-orange`, `neo-cyan` - Accent colors
- `neo-dark` - Primary text (#1a1a2e)

**Shadows (offset borders):**
- `shadow-neo-sm` (2px), `shadow-neo` (4px), `shadow-neo-lg` (6px), `shadow-neo-xl` (8px)

**Fonts:**
- `font-heading` (Space Grotesk) - Headings and buttons
- `font-body` (DM Sans) - Body text
- `font-mono` (JetBrains Mono) - Code

### Component Classes

Defined in `globals.css`:
- `.neo-card` / `.neo-card-hover` - Cards with border + shadow
- `.neo-btn-primary` / `.neo-btn-secondary` / `.neo-btn-dark` - Buttons
- `.neo-badge` - Badges
- `.neo-input` - Form inputs
- `.section-padding` - Standard section spacing
- `.prose-neo` - Documentation prose styling

## Adding Documentation

1. Add page metadata to `app/data/docs.ts` under the appropriate category
2. Create MDX file at `content/docs/{category}/{slug}.mdx`
3. Use available MDX components: `Callout`, `Collapsible`, `FAQItem`, `Steps`, `Step`, `QuickStartChecklist`

## Key Files

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout with fonts and metadata |
| `app/page.tsx` | Landing page composition |
| `app/docs/layout.tsx` | Docs layout with sidebar and search |
| `app/data/docs.ts` | Documentation structure definition |
| `lib/mdx.ts` | MDX file reading utilities |
| `lib/mdx-components.tsx` | Custom MDX component definitions |
| `tailwind.config.ts` | Design system tokens |
| `next.config.ts` | Next.js config with MDX support |

## Documentation Tracking

<!-- This field is automatically updated by the /update-docs command -->
docs-last-updated: 84da848e8de5f6961b08c11df34784ec34970397
