# Working on Todoer

Thanks for looking. This page is for changing the code. To install and use Todoer, see the [README](README.md).

## Run it

You need Node 22.18 or newer (`.nvmrc` says 24) and a free Supabase project to test against. Make a second one for this, so your own tasks are never in the way.

```
npm install
npm run develop
```

That's Next's development server at **http://localhost:3201**. It keeps its settings in `.dev-data` in this folder, which git ignores, so it never touches the project an installed Todoer on the same computer uses, and both can run at once. The first screen connects it to your test project, as it does for a user.

`npm start` is what users run: it builds when something changed, then serves the build on port 3101.

## The checks

Every one of these must pass before a change goes in, and CI runs them on macOS, Windows and Linux:

```
npm run typecheck
npm run lint
npm test
npm run smoke
```

- `lint` allows no warnings.
- `npm test` runs every `scripts/*.test.mjs`. `npm test -- ramble` runs only the files whose names contain "ramble".
- `smoke` builds and starts Todoer connected to nothing, as a new user's computer first runs it, and checks it answers, asks for setup, moves 127.0.0.1 to localhost, refuses another site's write, and sends the browser no secret.

## Tests

There is no test framework, on purpose. Each suite is a plain Node script that checks things and exits non-zero when one is wrong, which keeps them fast and readable, with nothing to configure. They cover the places where a mistake leaves nothing on screen: a task that lands in the wrong place in its day, a setup that makes two owners, a session refresh that signs someone out, a schema that drops a table.

- A new suite is a new `scripts/<name>.test.mjs`. `npm test` finds it by its name.
- `scripts/alias-loader.mjs` lets a test `import` app code by the `@/` path.
- Node strips TypeScript's types rather than compiling them. So a module a test loads must write type-only imports as `import type`, and must not use constructor parameter properties (`constructor(private readonly x: number)`), which Node refuses.
- When you change something a suite covers, change the suite with it. When you fix a bug that left no trace, add the check that would have caught it.

## How it fits together

- **Setup.** The project's URL and keys arrive after the build, so nothing reads them at build time. `src/selfhost/config.ts` reads them on each request, from environment variables or from `config.json` in the app-data folder. The root layout passes the browser's half (the URL and the publishable key, never the secret) to `ConfigProvider`, which sets up the Supabase client in `src/lib/supabase.ts`.
- **Which screen.** `src/selfhost/SetupGate.tsx` asks `/api/selfhost/status` where setup stands, and `src/selfhost/steps.ts` decides the screen from that and the session. It's pure, and `scripts/setup.test.mjs` tests every combination.
- **Server routes.** `src/app/api/selfhost/` (connect, check the tables, make the account, reset a password) and `src/app/api/ramble/` and `src/app/api/tasks/ramble/` (Ramble). Everything else the browser does is Supabase, under row level security.
- **The guard.** `src/proxy.ts` sits in front of every request. See [SECURITY.md](SECURITY.md).
- **The tasks page.** `src/app/tasks/page.tsx` and `src/components/tasks/`. The rules that decide things, like where a task lands, what an edit changed, and how a day is copied, are pure modules in `src/lib/` with suites of their own.
- **Ramble.** `RambleCard` records, `/api/tasks/ramble` sends the recording to the provider the user chose (`src/lib/ramble/providers.ts`, `src/lib/ai.ts`), and `src/lib/ramble/drafts.ts` turns the model's answer into tasks. The model reads, code decides: dates, times and priorities are settled in `drafts.ts`, not left to the model. publik's side is `src/lib/publik.ts`. `publik-app-token.txt` is public by design: it names the app, and each computer gets its own key from it.

## Changing the database

`supabase/schema.sql` is pasted into users' projects, again on every update that changes it, over tables that already hold their tasks. So it must:

- be safe to run again and again: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and the policy block that alters a policy in place rather than dropping it;
- never drop, truncate or delete anything;
- keep row level security on, with nothing granted to `anon`.

Bump `SCHEMA_VERSION` in `src/selfhost/constants.ts` and the version the SQL writes at its end, together. A project on an older version is then asked to run the setup again. `scripts/schema.test.mjs` checks all of this.

## Code style

- TypeScript strict, semicolons, double quotes, and the `@/` path for imports from `src/`.
- Function components only.
- Icons come from `@phosphor-icons/react`, the only icon package.
- Colours are CSS variables from `src/app/globals.css`, never a hex value on a themed surface. There are nine themes (`src/lib/themes.ts`): check a visual change in each, Light and Paper above all. `scripts/themes.test.mjs` fails when a theme is missing a variable.
- Tailwind v4: any base style or reset in `globals.css` goes inside `@layer base`. CSS outside a layer overrides every Tailwind utility.
- Styles a new component needs go in its own CSS module, and every new `var()` gets a fallback value.
- Corners come from the `--ui-radius-*` variables, never a pixel value.

## Where the code came from

Most of Todoer was taken from a larger private app, the author's own, at one pinned commit, by `tools/extract.mjs`. `extract-manifest.json` lists each of those files. The setup, the guard, the start script and Ramble's provider choice were written for Todoer.

The extracted files keep their comments as they were, so some name things that aren't in this repo:

- **"The owner"** is the original app's author, whose choices the comment records. A date says when the choice was made.
- **"CLAUDE.md"** is that app's notes for contributors. The parts that apply here are the ones in this page, plus these traps:
  - In `globals.css`, a `-webkit-backdrop-filter` beside `backdrop-filter` makes no frost at all: the CSS tool Tailwind runs keeps only the prefixed one, which current Chrome ignores. Write the unprefixed property alone there. A component's own `<style>` block isn't transformed, so the pair is harmless in one.
  - A dropdown inside a scroller with a `mask-image` is measured but never painted. Render it in a portal.
  - A stylesheet can arrive older than the page that uses it, so what a component needs ships in its own module.
- **`eslint-plugin-react-hooks` is held at 7.0.1** (`overrides` in `package.json`): 7.1 flags patterns all through the extracted code. Lift it in its own change, with the code fixed to match.

## Maintainer tools

- `npm run maint:extract` copies files from the source app, and needs it on disk (`SOURCE_REPO`).
- `npm run maint:check-private` checks the repo and its history against a private word list (`DENYLIST`), and passes without one.
- `npm run maint:trim-css` reports the rules and variables in `globals.css` that nothing uses; `-- --write` takes them out.

## Sending a change

1. Fork the repo and make a branch.
2. Make the change, with its checks, and run the four commands above.
3. Open a pull request saying what it changes and why.

By sending a pull request, you agree that your contribution is licensed under this repo's licence, [PolyForm Noncommercial 1.0.0](LICENSE.md), and that the copyright holder named in [LICENSE.md](LICENSE.md) may also release it under other terms, such as an open source licence if the project moves to one.
