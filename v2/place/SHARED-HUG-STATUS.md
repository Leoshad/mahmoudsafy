# Shared hug and fingerprint changes — 2026-09-24

Authorized target: existing Our Place, `Leoshad/mahmoudsafy`, branch `v2/first-slice`, root `v2/place`; do not change main or V1.

## Implemented source

- Fingerprint start region is the old bottom rectangle rotated onto the left edge; swipe right to start. The bottom/upward gesture belongs to hug. Overlapping regions resolve by gesture direction.
- Both accounts must have fresh focused Our Chat readiness, including the initiating device. No local-only fallback. Leaving the chat or losing foreground/connection ends participation. Readiness expires after 3.5 seconds when a departure cannot be delivered.
- Shared server session distinguishes `touch` and `hug`. Real holds from distinct authenticated accounts drive the existing four-second fill. No partner simulation in production.
- Completion does not stop hold heartbeats. Both hands must release; wait 1,000 ms, then fade for 1,400 ms. Holding again cancels the pending exit. The server also expires the completed session after this shared deadline.
- Fingerprint completion message is above the existing drawing. Fingerprint SVG and size remain unchanged.
- Hug invitation names the actual initiating partner. A continuously animated MP4 follows shared progress; completing the embrace retains its final pose with gentle breathing. This is not the rejected slideshow or cartoon prototype.
- `A shared hug ♥` is recorded once, using the fingerprint memory layout/time treatment and a different embrace icon; literal search works for either kind.

## Approved animation and validation

The user explicitly approved transferring only the derived illustrations to Higgsfield and spending 6 existing credits, with no purchase or subscription. The four-second continuous embrace was generated, reviewed, stripped of audio and compressed to a 720 x 720 H.264 MP4 (725,805 bytes). Original portraits and upload credentials are not included in the repository.

The asset is served with byte ranges and HEAD support for mobile playback and seeking. Both clients must load it before a hug can start.

- `npm run check` passed, including the memory PDF renderer.
- `npm test`: 553 passed, zero failed.
- `node tests/shared-hug-browser-check.mjs`: two independent Chromium processes loaded and played the actual clip, verified both initiator invitations, four-second dual holding, persistence while one holds, release grace/re-press/fade, leaving chat and rejection when a partner is away. Foreground was simulated to represent separate devices; this is not a physical iOS/Android test.
- Existing fingerprint browser check at 390 px confirmed its completion message is above the unchanged fingerprint and re-press cancels fading.

Deploy only this authorized branch to the existing Render service `srv-daj8d0fqj5pc73ckf5o0` (auto-deploy disabled). Verify the completed deployment and `/api/health` after triggering it.

## 2026-09-24 swipe reliability follow-up

The user clarified that either scene must track its swipe immediately and remain while the initiating finger is down even when the partner is absent. The fingerprint remains in the rotated left rectangle (rightward swipe); hug remains in the original bottom rectangle (upward swipe), with unchanged region dimensions.

The client now carries the original swipe contact into holding, keeps a local waiting preview without fabricating partner participation, retries the invitation while held, and fades the waiting preview on release. Shared progress still requires both focused clients and real holds. Small diagonal initial movement no longer abandons the gesture; activation travel is 60–90 CSS pixels instead of requiring a drag to the window center, and a rigid 300 ms cutoff was removed. Media loading no longer discards the swipe. Pending timers and holds clear on hiding, allowing repeated use. Unfinished shared scenes also expire after both fingers leave.

Validation: 556 unit/integration tests pass. The browser check uses native Chrome touchscreen input in two separate browser processes: repeated short rightward/upward swipes, solo waiting and release, partner arrival, carried swipe hold, both shared scenes completing, and the both-release/re-press lifecycle. Foreground is simulated for separate-device presence; physical phone testing remains a user-side check.

The user approved an explicit recipient hold target: a luminous heart circle beneath the characters, with the existing English join instruction. It brightens while the recipient holds and disappears at completion. The full character area remains interactive.

Follow-up: the user reported that the holding finger covered the artwork. The heart now stays in a dedicated strip under the characters on both sides, including after completion, with a stable artwork size. Moving an already-held swipe finger down to the heart does not release the interaction. The recipient invitation's CSS specificity was corrected after screenshot inspection revealed it was being hidden by the base fingerprint rule.

Final approved order: complete scene entrance first; reveal the hold heart after the 700 ms entrance. The initiator keeps the original swipe contact; the recipient sees the full waiting composition before holding can join. No shared hold is transmitted before the local entrance completes.

Name lighting now follows each actual hold, including after completion, with immediate local feedback and synchronized partner feedback. Final validation: full suite 558 tests passed before the name-lighting addition; all 20 client tests passed after it, including the new name-lighting case. Native touchscreen two-browser checks passed.
