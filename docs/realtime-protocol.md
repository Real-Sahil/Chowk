# Chowk — Realtime Protocol (Colyseus)

Contract source of truth: [`packages/contracts/src/realtime.ts`](../packages/contracts/src/realtime.ts) (Zod, typechecks today).
Protocol version: **1** (`PROTOCOL_VERSION`). Any breaking change bumps it; the server rejects mismatched clients with `protocol_mismatch`.

## 1. Rooms

| Room | Purpose | Capacity | Lifetime |
|---|---|---|---|
| `party` (`ROOM_PARTY`) | One per live party: roster, readiness, coarse-cell sharing, run control, verification | `parties.max_size` (≤ 6) | Created on first member connect; disposed 5 min after last member leaves |

There is deliberately **no global/district room** in v1: no stranger-visible presence, so nothing to stalk. (A district room, if ever added, would carry counts only, never positions — requires a privacy review.)

## 2. Connection & auth
```ts
client.joinById(partyRoomId, { protocol: 1, accessToken, partyId })   // PartyJoinOptions
```
`onAuth` (server): validate options with `PartyJoinOptions` → verify JWT (JWKS, `iss`, `aud`, `exp`) → confirm `sub` is a live member of `partyId` (service-role read) → attach `{userId, isAnonymous}` to the client. Failure → close code 4401 (unauthorized) / 4403 (not a member) / 4426 (protocol mismatch). Token is never placed in room state or logs.

**Reconnection:** `allowReconnection(client, 60)`. On drop the member is marked `connected:false` but keeps their seat; coarse-cell sharing stops immediately. Clients refresh the token then rejoin.

## 3. Synced state (Colyseus schema — kept deliberately tiny)
```
PartyState {
  partyId, status: "forming"|"in_run"|"disbanded", maxSize
  members: Map<userId, { displayName, role, ready, connected }>
  run?: { runId, questId, currentStepId, stepStatuses: Map<stepId,status> }
}
```
**Not in synced state:** any position, any token, any join code of other rooms. Coarse cells are discrete messages (below), so a client that doesn't opt in never receives them and state patches never contain location.

`party.snapshot` (S2C) sends the same shape as `PartyView` on join/reconnect for clients that prefer plain JSON over schema decoding.

## 4. Client → Server messages
All envelopes `{ type, payload }`. Payload validated by `C2S[type]`; invalid → `server.error{bad_request}` + a strike (3 strikes/60 s ⇒ disconnect). Max frame 4 KB.

| type | payload | Who | Rate limit | Effect |
|---|---|---|---|---|
| `client.heartbeat` | `{clientTs}` | any | 1 / 5 s | liveness; server replies `server.heartbeat` |
| `location.update` | `{fix: GeoFix}` | member | 1 / 2 s | Held **in memory only** (last 60 s ring buffer) for verification; if member opted in, derives a `CoarseCell` and emits `party.member.cell` to the *other* members |
| `party.ready` | `{ready}` | member | 5 / 10 s | toggles readiness |
| `party.kick` | `{userId}` | leader | 3 / 10 s | removes member, closes their socket, audit-logged |
| `party.leave` | `{}` | member | 2 / 10 s | calls leave RPC; handles leader promotion |
| `run.start` | `{questId}` | leader | 2 / 30 s | requires all members ready & size within quest bounds & party `forming`; creates run in one txn |
| `step.verify.geofence` | `{runId, stepId, fix}` | member | 6 / 30 s | geofence / party_sync verification (see §6) |
| `step.verify.code` | `{runId, stepId, code}` | member | 5 / 60 s | site-code verification |
| `run.abandon` | `{runId}` | leader (party) / owner (solo) | 2 / 30 s | ends run |
| `ping.emote` | `{emote}` | member | 4 / 10 s | relays one of `wave|here|wait|go|help` — the only member-to-member communication |

Rate limits live in `C2S_RATE_LIMITS`; exceeding returns `server.error{rate_limited}` (no strike for the first breach).

## 5. Server → Client messages
| type | payload | Notes |
|---|---|---|
| `party.snapshot` | `{party: PartyView}` | on join/reconnect, and after roster changes |
| `party.member.cell` | `{userId, cell: CoarseCell\|null}` | `null` = stopped sharing. Only to *other* members; never to the owner, never persisted |
| `party.member.emote` | `{userId, emote}` | |
| `party.kicked` | `{reason}` | followed by close |
| `run.started` | `{runId, questId}` | |
| `step.verification` | `{runId, stepId, outcome, hint?, attemptsRemaining?}` | response to the requester only. `hint` is a coarse band, never metres |
| `run.step.advanced` | `{runId, completedStepId, nextStepId\|null}` | broadcast to run members |
| `run.completed` / `run.abandoned` | `{runId}` | broadcast |
| `server.error` | `{code, message, ref?}` | `ErrorCode` enum; `message` is user-safe; `ref` correlates with server logs |
| `server.heartbeat` | `{serverTs}` | |

## 6. Verification handling (server)
1. Validate payload; confirm sender is a member of the run and the step is `available` (else `step_not_available`).
2. Take a per-run lock; mark step `verifying` (prevents double-advance, ABUSE-3).
3. Run `game-core` verifier with injected clock: accuracy gate → distance → dwell (from ring buffer) → plausibility (speed/teleport) [→ party quorum for `party_sync`].
4. Write one `verification_attempts` row (no coordinates).
5. Accepted → transaction: step completed, next step `available`, run advanced/completed, stamps on completion. Then broadcast.
6. Rejected → step back to `available`; respond with outcome + band.
Idempotency: repeating a request for an already-completed step returns `accepted` without side effects.

## 7. Error codes
`bad_request`, `unauthorized`, `forbidden`, `rate_limited`, `not_in_party`, `not_leader`, `run_not_active`, `step_not_available`, `verification_failed`, `protocol_mismatch`, `internal`. Close codes: 4401, 4403, 4426, 4429 (strikes).

## 8. Example exchange
```jsonc
// C → S
{ "type": "step.verify.geofence",
  "payload": { "runId": "…", "stepId": "…", "fix": { "lat": 0.0, "lng": 0.0, "accuracyM": 12, "clientTs": 1790000000000 } } }
// S → C (requester only)
{ "type": "step.verification", "payload": { "runId": "…", "stepId": "…", "outcome": "rejected_distance", "hint": "close" } }
// later S → party
{ "type": "run.step.advanced", "payload": { "runId": "…", "completedStepId": "…", "nextStepId": "…" } }
```
(Coordinates above are zero placeholders.)

## 9. Testing
Contract tests round-trip every schema with valid/invalid fixtures; a headless client harness (colyseus.js + vitest) drives full scenarios: join → ready → start → verify (accepted/rejected/replay) → reconnect → kick; load test 200 rooms × 4 clients at the update cap on a 1-vCPU instance to confirm the budget.
