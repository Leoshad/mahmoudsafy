# Care phase 1 — local release review

Base: adc872449bc95f37de85c04e6427f3074ada9d84 (v2/first-slice).
User-supplied revision 2 applied with git am on care-tab. No deployment performed.

## Repairs
- Scheduled doses require a valid slot; untimed weekly doses have a unique daily slot.
- Duplicate checks use the caller's visible records, so hidden private doses do not disclose their existence.
- Historical pagination uses timestamp plus ID; empty recent lists start at the first history page.
- Home lab tiles include the printed reference text, printed flag, unit and full date.
- Four mobile tabs use widths that keep the original navigation height.
- Updated an obsolete playlist test selector to the existing persistent upload input. Playlist runtime unchanged.

## Evidence
- npm run check: exit 0, including PDF rendering.
- npm test: 754/754 main tests pass; additional subprocess test passes; Restic restore integration skipped because the executable is absent.
- npm run test:browser: 13/14 pass; shared-activity check hit a 30-second timeout. An unchanged standalone rerun passed. Root cause of the transient timeout is not established.
- Care browser regression passes: private shortcut defaults private, hidden from other account HTTP/export, old-only history accessible, no horizontal page overflow at 320/390/430px.
- Local comparison against the baseline confirms identical chat, timeline, composer and shell bounding boxes at 320/390/430px, viewport height 740px.
- Synthetic 2,000-entry revision-2 benchmark: approximately 7ms cold, 0.006ms cached. Not a production load test.
- Regression covers 850 same-timestamp entries without loss/duplication and private-dose conflict isolation.

## Boundaries
No private import file is tracked. No real health data was imported into a running service. No external writes, plan changes, deployment, or production data mutation occurred.
Care remains phase 1: no Care push reminders, document uploads, doctor summary PDF or trend charts. Existing notification runtime is unchanged. Physical phone behavior and production load have not been tested here.

## Proposed release
After explicit approval, fast-forward/merge care-tab into v2/first-slice, push reviewed source to Leoshad/mahmoudsafy, and deploy the exact resulting commit to the existing Render service. Recheck the live head before doing so. Keep the existing plan and persistent data. A persistent-disk deployment can briefly interrupt service. Verify deployed commit, health, errors and memory afterward; do not auto-import the private labs file.
