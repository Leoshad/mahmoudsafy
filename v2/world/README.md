# Live-AI world trial — implementation checkpoint

This is a separate, unapproved trial, not a replacement deployment for V1 or the legacy V2 room. The actual UI is in `public/`. No live AI call or deployment has been performed. Browser visual verification is blocked: the remote browser rejected `http://terminal.local:4174` with `ERR_BLOCKED_BY_CLIENT`. Do not call this design approved or visually verified.

Implemented: two server-issued participant identities, shared persistent state, free text addressed either to the partner or to Echo, validated AI actions, independently held Just Us pauses, saved message history, and conservative one-time request accounting. Echo can move itself among four anchors, open a bridge, change atmosphere, and create/replace one described object per anchor. This is a finite capability experiment, not an infinite world generator. No cottage/farming theme. English interface, user-language content.

## Local run and deployment prerequisites

Node 24+ is required (`node:sqlite`). Run `npm run world:start` from the repository's `v2` directory. Required private server environment:

- `WORLD_ORIGIN`: the exact HTTPS origin (localhost HTTP permitted only for local work).
- `WORLD_DB_PATH`: absolute path on a **persistent** disk, separate from every V1 resource.
- `WORLD_SESSION_SECRET`: random secret, at least 32 characters.
- `MAHMOUD_PASSPHRASE`, `SAFY_PASSPHRASE`: distinct random trial access phrases, at least 24 characters. These are temporary two-person trial access, not full Supabase account enrollment.
- `OPENAI_API_KEY`: user's project service-account key, entered privately at the hosting provider. Never in chat, source, browser storage, client code or screenshots.
- `PORT`: hosting-assigned port, default 4174.

No automatic deployment configuration was changed. The existing root `render.yaml` still points at the older V2 and must NOT be used to publish this trial. A durable single-instance service and its current inclusive price must be verified before deployment. SQLite WAL is for a single host; do not put it on a shared network filesystem or scale this service horizontally. Backups are not configured. Do not delete or restore an older budget database while the key remains active; reservations must not reset. Do not use the same key for unrelated test traffic.

## AI contract and privacy

Each AI turn returns strict structured data with at most three actions and one reply. All actions validate atomically against current state; the reply is shown only after commit. Invalid actions or provider failures produce an explicit failure, with no canned AI fallback. World rules, identities and game scores cannot be edited by the model. Historical factual recall is not implemented; the prompt forbids invented memories, but prose truthfulness still needs live evaluation.

Partner-addressed messages never enter AI context, even after Just Us is released. Each participant controls their own pause. A pause transition invalidates an in-flight reply; a request already sent to the provider cannot be recalled. Shared state and explicitly AI-addressed messages are sent to OpenAI. `store:false` is used, not a promise of zero provider retention or end-to-end encryption. Server-side history is limited to the latest 120 messages; AI sees at most the latest 12 AI-visible messages. Private prep, Us archive and the older secret-guessing game are not yet integrated into the world UI; they remain in the older source.

One pending AI turn per world: a concurrent second request gets an explicit busy response and retains its draft. Human conversation and movement continue while Echo answers. Command IDs and reservations persist across process restarts. Stale requests are expired, never silently retried.

## Trial cost guard

Price checked 2026-09-12: GPT-4.1 mini input $0.40 / output $1.60 per million tokens. Snapshot `gpt-4.1-mini-2025-04-14` supports Responses and structured output. Source: https://developers.openai.com/api/docs/models/gpt-4.1-mini

Each call is bounded to 24,000 UTF-8 bytes of request body and 900 output tokens. Reserve $0.02 before sending, conservatively keeping even failed/cancelled calls charged against the allowance. Stop at $3 total reservations (at most 150 attempts), with no monthly reset and no retry loop. This is a conservative internal allowance, not a measured invoice. The user's separate OpenAI $4 monthly hard limit remains a second guard; it can enforce late. Hosting, taxes and payment fees remain separate and must fit the agreed SAR 80/month plus SAR 20 once. No paid calls or purchases were made to verify this checkpoint.

## Verification

`npm run world:test`: unit/integration tests with an explicitly fake provider, covering permissions, atomic rejection, idempotency, concurrency, Just Us cancellation, private context exclusion, persistent budgets, provider response format, and HTTP auth/origin checks. Existing `npm test` and `npm run build` should also pass.

`world/tests/ui-fixture.mjs` is a disposable local-only UI harness with in-memory state and **no live AI, real credentials or private data**. It is not a deployment target, does not test authentication, and must not be deployed. HTTP tests separately exercise authentication.

Next gates: browser/mobile review of actual UI, separate durable hosting within the total budget, secure key entry, then a bounded two-person live test. Evaluate originality, truthful action descriptions, latency and measured usage before claiming the companion is good enough or expanding the world.
