# Mahmoud × Safy — V2 first slice

Implementation branch: `v2/first-slice`. All new files live under `v2/` in GitHub. V1 root `index.html`, `main`, its Pages deployment, Auth and database are unchanged.

## Built

- React mobile room and invite-only login; local design preview at `?preview=1` explicitly uses sample data and never impersonates live AI.
- One server-side TypeScript Secret Match engine: both ready, independent sealed numbers and guesses, simultaneous reveal, exact/near scoring, three rounds, resumable canonical state and abandoned/completed history.
- PostgreSQL room locks, receipts, atomic state/result writes, non-public storage, per-member state projection; no browser access to database tables.
- Supabase password login through the server with Secure HttpOnly same-origin cookies, server-verified user identity and explicit room membership. Current session lifetime is at most one hour; re-login is required at expiry. No automatic provisioning or email sending.
- Persistent per-person Just Us. Explicit AI requests only in this slice; no autonomous agency. Requester-owned text goes to AI, never silent conversation or game secrets. The first version holds a complete reply for an independent checker before publishing. This deliberately avoids unverified raw-token streaming.
- Conservative SQL-backed cost reservation: test calls <= USD 4 total, production AI <= USD 6/month. No automatic ambiguous paid-call replay. Fixed hosting, fees and taxes must still be checked independently against the approved SAR 80 total.

## Verified on 2026-09-11

- 12 engine, audience, consent, V1 isolation and reservation tests pass.
- TypeScript check and production Vite build pass.
- Browser preview renders, game rules and consent control available; preview is not a live multiplayer test.
- V2 project `hvjcugehjwqtrvzgbwnq` created in Frankfurt at quoted USD 0/month.
- `first_slice_private_core` migration applied to V2 only. All eight private tables have forced RLS, no anon/authenticated SELECT grants; Supabase security advisor returned no findings.
- No paid API requests, subscriptions or production deployment performed.

## Connection and release gates still open

Render connector must be linked first. Re-verify actual Starter price, tax/FX and bandwidth allowance before subscription. Deploy only this branch with `rootDir: v2`; do not enable automatic deployment of V1. `render.yaml` is configuration, not an executed subscription.

Runtime needs secure V2-only database credentials, publishable key, OpenAI key and exact HTTPS origin. The database transaction sets `ms_runtime`, a restricted non-login role. Provision a dedicated login role with permission to assume it; never put admin credentials or secrets into Git or the browser. The app refuses any Supabase URL other than V2 and checks database project identity inside every transaction.

Provision the two Auth identities and their private membership rows securely after account details are available; neither has been fabricated or copied from V1. No users enrolled yet.

Before release: real two-session authentication, simultaneous commands, connection interruption/receipt replay, concurrent Just Us cancellation, model quality/source attribution, measured first-response latency, encrypted daily backup and restore drill, aggregate Free quota (including V1), and phone layout checks must pass. Backup scheduling, R2 connection, retention and restore are not yet implemented. No claim of live usability, guaranteed latency or recovery is made.

Current UI AI asks are intentionally single-turn with only explicit request text. Continuing conversational threads, authoritative history citations and richer context need completion and acceptance before claiming the complete conversational experience from Product Vision. The implemented checker is a safety filter, not a proof that hallucinations are impossible.

## Local commands

`npm ci`, `npm test`, `npm run build`; `npm start` requires secure runtime configuration from `.env.example`. Dependencies are pinned in `package-lock.json`. Never commit populated environment files.
