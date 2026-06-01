# Agent Hub

Personal hub for autonomous AI agents. See [agent-hub-plan.md](../agent-hub-plan.md) for the full project plan.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then fill in real values
```

The single `.env.local` at the repo root is loaded into both Next.js and Prisma via `dotenv-cli` in the package scripts. Don't put separate `.env` files in subpackages — keep one source of truth.

## Structure

```
agent-hub/
├── apps/
│   └── dashboard/              Next.js dashboard
└── packages/
    ├── core/                   Shared: db, llm wrapper, inngest, langfuse
    ├── agent-jobhunt/          /job-hunt agent (coming soon)
    └── agent-news/             /get-news agent (coming soon)
```

## Scripts

- `pnpm dev` — run all dev servers
- `pnpm build` — build all packages
- `pnpm typecheck` — typecheck all packages
- `pnpm --filter @hub/core db:migrate` — run Prisma migrations
- `pnpm --filter @hub/core db:studio` — open Prisma Studio
