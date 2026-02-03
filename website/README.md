# Starknet Agentic Website

Landing page for the Starknet Agentic project.

## Stack

- **Framework:** Next.js 16.1
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build
```

## Structure

```
app/
├── components/
│   ├── Hero/           # Hero section + install command
│   ├── Navbar/         # Desktop + mobile navigation
│   ├── sections/       # Page sections (Vision, Apps, etc.)
│   └── ui/             # Reusable UI components
├── data/               # Static data + TypeScript types
├── hooks/              # Custom React hooks
├── globals.css         # Tailwind + custom styles
└── page.tsx            # Main page composition
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
