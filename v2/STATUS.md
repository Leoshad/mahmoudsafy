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
