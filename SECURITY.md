# Security

## Reporting a problem

Please report it privately: on this repo's **Security** tab, press **Report a vulnerability**. Don't open a public issue for it. You'll get a reply there, and the fix goes out as a new release before anything is said in public.

Only the latest release is fixed. To update, see [Update](README.md#update).

## What Todoer protects, and how

Todoer runs on the user's own computer against their own Supabase project. What it guards:

- **The secret key** (`sb_secret_`) is kept on the server side only: in `config.json` in the app-data folder, readable by the user's account alone (mode 600 on Mac and Linux). It is never sent to the page, and a secret key set where the publishable key belongs is refused rather than sent. A page can't move Todoer to another project: once one is saved, only new keys for that same project are taken, and moving takes removing `config.json` by hand (README, "Your data", "Another project").
- **This computer only.** The server listens on 127.0.0.1, and `npm start` holds the same port on [::1], where a browser looks for localhost first, so no other program can answer there in Todoer's place. `src/proxy.ts` refuses any request whose Host isn't a loopback name, which stops a web page pointing its own domain at Todoer (DNS rebinding), and every write must come from Todoer's own pages (same origin, and JSON or a form upload such as Ramble's recording), which stops another site posting to it.
- **One owner per project.** The account is made by the server with `app_metadata.self_host_owner`, which only the secret key can set. The tables' row level security needs that flag as well as the row's own user, so someone who signs up to the project through Supabase's API sees and writes nothing. Ramble's routes, the only ones that spend anything, check the same flag on the caller's session. A forgotten password is reset only with the secret key.
- **Ramble's keys** stay on the server side: the Groq key in `settings.json` beside the config, the publik key in publik's own file. Neither reaches the page; Settings shows only the Groq key's last four characters.
- **The database setup** (`supabase/schema.sql`) never drops or deletes anything, stops before changing anything if the project has a table by one of Todoer's names that Todoer didn't make, revokes everything from the browser's roles before granting the four privileges the app needs, and keeps the server's own tables out of the browser's reach.

`scripts/proxy.test.mjs`, `scripts/schema.test.mjs`, `scripts/owner-claim.test.mjs` and `scripts/config.test.mjs` hold these in place.

## Out of scope

- Someone who can already use the computer as its user: they can read the settings file, as they can read anything else of that user's.
- Supabase's own service, and the AI services Ramble sends a recording to (Groq, publik), with the goal names and task titles it needs to read it.
