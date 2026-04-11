## Overview

This is a Next.js App Router full-stack app. The UI and server routes live in the same codebase:

- UI pages: `src/app/**/page.tsx`
- API routes: `src/app/api/**/route.ts`
- ORM: Prisma
- Default MVP DB: SQLite

## Local Development

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) with your browser.

## Auth + Database

This app uses Google OAuth, a workspace-based access model, and Prisma.

Required env vars:

- `DATABASE_URL` (SQLite path for MVP, e.g. `file:./dev.db`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PUBLIC_BASE_URL` in deployed environments

Legacy compatibility:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

After updating the Prisma schema, run:

```bash
npx prisma db push
npx prisma generate
```

## EC2 Deployment With SQLite

For MVP deployment, SQLite is acceptable if all of the following are true:

- Single EC2 instance
- Low write concurrency
- DB file stored outside the code directory
- Regular backups enabled

Recommended production SQLite path:

```bash
DATABASE_URL="file:/srv/eve-event-app/data/eve.db"
```

Do not keep the production DB inside the repo checkout directory.

See [`deploy/DEPLOY_EVE_EC2.md`](./deploy/DEPLOY_EVE_EC2.md) for the EC2/PM2/Nginx deployment flow.

## When To Move Off SQLite

Move to PostgreSQL when:

- concurrent users increase noticeably
- long-running analysis jobs and normal traffic start contending
- you want more than one app instance
- operational backup/restore needs become stricter

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn)
