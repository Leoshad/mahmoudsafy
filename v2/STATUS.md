# Current approved direction — 2026-09-13

The user approved the Our Place chat / Our Space / private quiz preview and asked to implement it, emphasizing fast messages and fast streamed AI. The approved title is Mahmoud ♥ Safy; English UI with Arabic or English content, dark charcoal / muted premium pink / gold. This explicitly replaces the earlier world direction below.

New implementation lives under `v2/place/`; see its README for supported behavior, 20 local test results, budget ledger, deployment setup and remaining live gates. Its dedicated Blueprint is `v2/place/render.yaml`; do not accidentally deploy the older entrypoint. No deployment or paid service was created during implementation. Render requires the user's explicit confirmation of `Mahmoud's workspace` before service inventory. Supabase V2 is ACTIVE_HEALTHY and SQL reads work; zero auth users were found. Its existing private tables are preserved. OpenAI is not live-tested or configured; the key stays with the user until secure server entry. Browser/mobile visual verification remains outstanding.

The required historical acceptance reference was recovered and read from the saved `Mahmoud-Safy-Acceptance.md`; its old unapproved UI/world requirements are superseded where the newer conversation explicitly changes them. Source saving remains authorized only to `Leoshad/mahmoudsafy`, `v2/first-slice`, under `v2/`. Do not modify main or V1.

## Historical checkpoints (retained)

# Current V2 status

The user explicitly authorized saving V2 source to `Leoshad/mahmoudsafy`, branch `v2/first-slice`, under `v2/`. This resolves the earlier destination-authorization rejection for this scope only. Never update main or V1 as part of this work.

This checkpoint preserves the existing first-slice backend and older interactive preview source. These interfaces are NOT approved and are NOT the new AI-world experience. Do not deploy this checkpoint as the requested world sample.

Latest direction: a private, persistent world for Mahmoud and Safy, with genuinely creative AI characters and meaningful changes to the world. Pixel art was received positively; cottage/garden themes, farming, scripted button-choice stories and the lower control panel were rejected. No replacement world art direction has been approved. UI remains English/LTR; human content may be Arabic.

The next meaningful sample must test live AI interpreting free input and making validated changes to world state. Existing scripted previews cannot demonstrate this. Existing backend AI does not yet implement world-state tools. Supabase authentication/enrollment and runtime credentials are not configured locally. No live deployment is ready.

The user created OpenAI project `Mahmoud Safy` and a service account, and retained its secret. Never request the secret in chat, commit it, or print it. The project spend-limit screen was configured toward USD 4 with hard enforcement; platform enforcement can lag and this monthly limit is not a one-time test budget. Runtime accounting must also constrain the one-time test.

Budgets: SAR 80/month inclusive of fees/tax and SAR 20 additional for testing once. Revalidate model/service prices before incurring costs. Existing prices/model names in source are not approved current quotes. No service purchase is authorized by the source-saving approval.

Read this status before older acceptance notes. Older product scope and prototype gates are historical where superseded by the user's newer direction. Preserve reusable code without silently treating historical UI as accepted.

## 2026-09-12 world implementation checkpoint

A separate `world/` trial now implements the new free-input direction, persistent SQLite state, two-person trial access, validated world actions, Just Us cancellation and a lifetime $3 conservative AI reservation guard. Use `npm run world:start`; the existing start/render configuration still serves the older V2 and is not the world deployment target. See `world/README.md` for exact boundaries. AI is not configured or live-tested. The browser could not access the local preview (ERR_BLOCKED_BY_CLIENT), so visual/mobile review remains outstanding. This is implementation progress, not a completed deployed app or design approval. No V1 or Supabase resources changed. No charges incurred.

The previous attempt to save the world payload was blocked by automatic approval review. The user has now explicitly approved the exact action again: save the new V2 source to `Leoshad/mahmoudsafy`, branch `v2/first-slice`, under `v2/` only, without deployment or V1/main changes. This checkpoint uses that authorization; it does not authorize publication or purchases.


## 2026-09-14 Our Place background notifications

The current user session concerns the existing live Our Place app at `https://mahmoud-safy-our-place.onrender.com`, not the historical world preview. The user explicitly requested implementation of background-only notifications for Mahmoud and Safy. Existing service/workspace and source branch remain the delivery target: Render `srv-daj8d0fqj5pc73ckf5o0`, `Leoshad/mahmoudsafy` branch `v2/first-slice`, app root `v2/place`. Historical world-preview no-deployment notes do not describe this current approved app task. No V1/main or new paid service changes.

Notification implementation uses opt-in Web Push with persisted encrypted subscriptions/VAPID keys, visible-account suppression across tabs/devices, short-lived collapsed alerts, quiet likes, and direct activity links. See `place/README.md` for event coverage and actual limitations. Existing private-preparation removal and drawing fixes are preserved; legacy preparation records remain stored and inaccessible, not deleted. Real phone push delivery and vibration need permission enabled on each phone and have not been physically tested here. iOS sound/vibration remain OS controlled; no custom sound/strength guarantee.

## 2026-09-28 original layout constraint

User explicitly requires original app/chat/composer dimensions and positions to remain unchanged by additions. Music pulse must fit the existing space below the composer as a transparent overlay; never reserve extra padding, shrink the timeline, or move the composer to accommodate it. Its approved motion/transparency and the header music controls are retained. Future additions must adapt to original geometry unless the user explicitly requests a layout change.

## 2026-09-28 Echo post ownership
Add a moment is for Mahmoud/Safy. Post with Echo is a separate adjacent entry point. Reviewed Echo proposals publish as Echo, record the requesting person, notify the partner, and are consumed atomically. Echo editing drafts retain their proposal identity; discarding them dismisses the server proposal. Deleted posts/comments lose in-app inbox links and queued push alerts. Already delivered OS notifications cannot be recalled by this cleanup. Original unrelated layout remains unchanged.


## 2026-10-04 — chat photo albums and PDF attachments
- User requested selecting multiple photos in one send and sharing PDFs. Added up to 10 photos with draft previews and a responsive chat grid; each opens the existing zoom viewer. Added authenticated PDF uploads up to 10 MB, filename/size cards, and open/download links.
- Additive SQLite migration preserves existing messages. Albums and PDFs are included in the full recovery database and referenced-attachment export; album photos are protected from orphan cleanup.
- Validation: 690 unit/integration tests passed; build check including memory PDF renderer passed. Two-account browser check at 390×740 verifies upload, delivery, opening each photo, PDF card, reload persistence and no horizontal overflow. This is mobile emulation, not a physical-device claim.

## 2026-10-07 — playlist upload feedback
- Add songs now uses one persistent file picker outside snapshot-rendered playlist DOM. Reading/uploading, completion, duplicate-song and error messages remain visible in the playlist; concurrent uploads are disabled. Account reset clears upload UI and stale callbacks.
- User MP3 (5.8 MB) passed validation and uploaded locally; exact device failure was not reproduced. Mobile-size browser checks covered an open picker across a playlist snapshot, actual upload, duplicate feedback and a simulated storage-full response. All 690 tests passed. Local check syntax stages passed; unrelated memory PDF check was blocked by local Chromium extraction/runtime, so Render's existing build check remains the release gate.

## 2026-10-08 — camera in chat
- Added Camera to the chat + menu with a persistent image picker requesting the rear camera. Captures use the existing compressed photo upload and draft preview, then the normal Send action. Camera originals up to 20 MB are resized before upload; gallery limits remain unchanged.
- Mobile-size two-account browser check passed: Camera opens the picker, capture hint is present, preview does not send automatically, photo arrives after Send, existing albums/PDFs and reload still work. Native camera launch depends on the phone browser and was not physically tested.

## 2026-10-16 — lower-bandwidth recovery
User explicitly requested implementation after reviewing the incremental-backup approach. Added pinned Restic/Rclone tools and a separate encrypted deduplicating repository within the existing authorized Drive folder. Daily cadence is preserved. A fresh remote restore must byte-match the already SQLite-verified local archive before the existing monitoring success event is emitted. Incremental failure uses the legacy full upload/restore path; old independent Drive archives are preserved on successful migration. No UI, live database schema, main/V1, paid service or backup-frequency changes.
Synthetic 100 MiB attachment trial: initial packed data 105010837 bytes; +100 text messages 1387764 bytes; +1 MiB random attachment 5590565 bytes; deletion 3653186 bytes. All restores byte-matched. These are experimental new-packed-data sizes, not production billing or promised savings. Live initial snapshot still needs one full upload. See place/README.md for recovery, retention caveats and rollback. Existing HTTP bandwidth edits were set aside for this backup-only release.

## 2026-10-17 — connection retries and session continuity
- User requested urgent connection repair and reported involuntary sign-outs for both accounts. Production logged 401 on state/events at 05:00 UTC; existing logs do not distinguish missing/expired cookies from other local rejection. Added credential-free rejection codes for future diagnosis.
- Client owns failed SSE retries with 0.5–8 second backoff, stops failed/connecting streams in the background and resets the wait on foreground/network return. Existing HTTP message fallback, outbox, healthy streams and presence proof remain.
- Provider refresh credentials are encrypted in local SQLite by session ID and refresh work is serialized per session. Delayed/lost Set-Cookie responses no longer force replay of older refresh tokens. Existing cookies migrate lazily after validation; revoked/expired sessions cannot be revived. Active sessions renew the seven-day inactivity window at most daily after successful authentication. Logout and password/session revocation delete stored credentials through a SQLite trigger.
- Validation: 699 unit/integration tests passed; separate backup tool-output safety test passed and external Restic integration skipped locally. Build check including PDF rendering passed. Two-account Chromium mobile emulation passed network recovery, both-direction delivery, missed-message recovery and blocked-SSE fallback; no background failed-SSE retries. Tests cover stale cookies across two token rotations and server restart, expiry, outage, logout and existing password revocation. Physical phones are not directly tested. Requires page refresh after deployment for new client code; sessions already expired/revoked require login once.

## 2026-10-17 — notification recovery
- Previous connection/session release confirmed live at commit d88a8af. Runtime logs subsequently show provider acceptance and device display receipts, but also three expired deliveries and one HTTP 410 subscription removal. Logs do not identify which physical phone failed.
- Chat/Echo alerts now survive up to one hour offline instead of two minutes, retaining collapse, expiry, account checks and foreground suppression. New non-quiet deliveries may re-alert an existing OS notification; likes remain silent.
- Existing opt-in browser subscriptions are checked periodically while visible and on foreground/network return; missing server bindings retry after transient failure. Requests have a ten-second timeout. No permission prompts or new subscriptions are initiated automatically.
- Validation: 702 main tests passed, 32 notification tests passed after final timeout change; build/PDF check passed. Physical-phone permissions and OS delivery still require a test on each phone.

- Follow-up: user supplied the exact Enable failure. Enable no longer deletes an existing browser subscription merely because its server binding is absent or server registration fails. Replacement is limited to a mismatched VAPID application key; transient AbortError gets one bounded retry. Errors retain their real browser cause and distinguish server save failures. All 35 notification tests pass, including preservation on failed registration and error reporting. The physical-device registration error still requires a post-deploy retry to confirm.


## 2026-10-26 — Hold Hands implementation checkpoint (NOT DEPLOYED)
- User approved realistic hands with lavender and brown sleeves and explicitly requested implementation. Upward swipe now shows Hug / Hold Hands together; selection remains within the original drag and commits only on release over an option. Cancelling does not invite the partner. Side fingerprint swipe remains.
- Added distinct hands readiness, shared animation synchronization, explicit tap-to-join with heartbeat until exit, and a deduplicated Together memory with date/time. Existing Hug press/hold remains.
- BLOCKER: approved storyboard is still images only. Actual continuous `public/hold-hands-motion.mp4` and final `public/hold-hands-memory.webp` are NOT present. Never deploy this checkpoint until real media is supplied and visually verified. Do not replace the approved artwork with the hug test fixture, crossfaded stills, or a drawing.
- Higgsfield read-only quote: Seedance 2.5, one silent 5-second 720p video = 35 credits; account balance 4. No generation, purchase, subscription or deployment performed.
- Validation: 708 unit/integration tests pass, including 43 shared-moment/readiness tests. Browser regression was updated for the new gesture; it explicitly uses the existing hug clip as a hands transport fixture only. Browser execution could not launch Chromium in this environment. Build syntax checks ran, but full check failed in Chromium/PDF runtime (font extraction chown EINVAL); no mobile visual or real video acceptance claimed.
- Source is a local unpushed checkpoint on v2/first-slice only. Existing production remains unchanged.

## 2026-10-26 — Hold Hands media completed
- User supplied and approved `1000428252.mp4` and requested deployment. Added original 720p/24fps video with audio removed losslessly; ten-second natural playback, then retain final frame with existing glow. Added a small final-frame memory image and range-enabled video route.
- Hands now use a ten-second shared fill; Hug/Touch retain four seconds. Two browser processes at mobile width passed native touch choice, cancellation, existing Hug pause/resume, hands tap acceptance, one completion, explicit exit, and unchanged side-touch behavior. Actual video used, foreground simulated; physical Android not tested.
- 708 unit/integration tests passed. Complete syntax/PDF check passed using a local Chromium runtime adapter (no production dependency changes). Previous missing-media/runtime blockers above are resolved.
