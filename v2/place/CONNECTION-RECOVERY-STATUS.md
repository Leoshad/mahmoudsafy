# Foreground connection recovery — 2026-09-24

User reported variable 8–30 second online delays after switching away and back, including after previous recovery patches.

## Evidence and scope

- Existing recovery unconditionally closed the EventSource on background return, including healthy sockets, and a suspended full-state request could keep the main recovery task occupied.
- Supabase V2 edge logs for 05:00–06:00 UTC showed 378 successful user checks, averaging about 178 ms and peaking at 1,101 ms. Those server-side measurements do not explain the entire phone delay and do not measure the phone network.
- No authentication bypass, longer verification cache, identity change, Supabase schema change or hosting purchase is part of this fix.

## Current recovery

- Retain an OPEN socket for a 1.5-second foreground probe. Any actual incoming event keeps it alive; a silent socket is replaced. Do not fabricate a heartbeat.
- Independently fetch the real app snapshot immediately on foreground resume, without waiting for the older snapshot/recovery task. Abort this probe on background/offline or after four seconds, and reject obsolete account responses.
- While EventSource is unavailable or silent, fetch actual state every two seconds with one probe in flight. This receives messages and retries the existing outbox. Stop fallback polling when the live stream resumes.
- Verified snapshot receipt can establish transport readiness for presence. A failed stream does not erase recent proven fallback connectivity. Presence remains foreground-only, acknowledged by the server, and expires without fresh proof.

## Validation

Syntax/PDF check and 575 tests passed, including suspended-snapshot recovery, silent vs healthy socket return, stale-response rejection and both-direction HTTP message catch-up. The optional full-app Chromium test blocks EventSource in both browser processes and verifies actual chat sends/replies, peer offline during background, and fresh presence acknowledgement after resume. Measured local message delivery was 1.26 s and 1.76 s; foreground acknowledgement was 27 ms. These are local test timings with simulated device focus, not a physical-phone latency guarantee.
