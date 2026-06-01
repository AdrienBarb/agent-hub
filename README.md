# Agent Hub

Personal hub for autonomous AI agents. See [agent-hub-plan.md](../agent-hub-plan.md) for the full project plan.

## Setup

```bash
pnpm install
```

## Structure

```
agent-hub/
├── apps/
│   └── dashboard/              Next.js dashboard (coming soon)
└── packages/
    ├── core/                   Shared: db, llm wrapper, inngest, langfuse
    ├── agent-jobhunt/          /job-hunt agent
    └── agent-news/             /get-news agent
```

## Scripts

- `pnpm dev` — run all dev servers
- `pnpm build` — build all packages
- `pnpm lint` — lint all packages
- `pnpm typecheck` — typecheck all packages
