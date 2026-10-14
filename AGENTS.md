# Notes for coding agents

Todoer is a Next.js 16 app (App Router, TypeScript strict, Tailwind v4) that runs on the user's own computer against their own Supabase project. [CONTRIBUTING.md](CONTRIBUTING.md) is the guide: how it fits together, the code style, the database rules and the traps. [SECURITY.md](SECURITY.md) says what must stay true.

- Run it with `npm run develop` (port 3201, its own settings in `.dev-data`), never on the user's own Todoer data.
- Before saying a change is done: `npm run typecheck`, `npm run lint`, `npm test`, `npm run smoke`.
- `supabase/schema.sql` runs over users' existing tables: never drop or delete, and bump `SCHEMA_VERSION` with any change.
- Never print, log or commit a key (`sb_secret_`, `gsk_`, `pk_`). `publik-app-token.txt` is the one token that is public.

## publik API
- Base URL: https://publikhq.com/api/v1 (OpenAI Chat Completions, Responses, Anthropic Messages)
- Models: publik-fast, publik-balanced, publik-smart only; never a vendor model name
- Key: per-install `pk_` from POST /installs, stored at the publik credential path; env PUBLIK_API_KEY / PUBLIK_API_BASE_URL override
- App token: publik-app-token.txt (public by design, committed) or PUBLIK_APP_TOKEN
- 402: show error.message plus error.top_up_url only
- Never print or log a key
- Docs: https://publikhq.com/llms.txt, https://publikhq.com/developers, https://publikhq.com/skills/api.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
