# TodayPaper development rules

- This is a Next.js App Router project using TypeScript, React, npm, Vitest, and ESLint.
- Read `README.md` first. Open `FRONTEND_PROJECT.md` or files under `docs/` only when the task depends on them; never preload `docs/previews/`, `node_modules/`, `.next/`, or generated artifacts.
- Keep changes scoped, preserve existing API contracts, and maintain strict type safety.
- Never commit secrets or local environment files. Update `.env.example` when adding a required variable.
- Run the smallest relevant check while iterating. Before handing off broad changes, prefer `npm run check:frontend`; for focused changes, report the exact lint, typecheck, or test command run.
