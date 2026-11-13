# Chowk — Realtime Protocol (Colyseus)

Contract source of truth: [`packages/contracts/src/realtime.ts`](../packages/contracts/src/realtime.ts) (Zod, typechecks today). **Revision 2:** this protocol covers lobby/party presence only. Run control and verification are HTTP (`packages/contracts/src/api.ts`) handled by Next.js; Colyseus has no database access. Hosting caveat: the realtime server runs on a free host that **sleeps and restarts** (see `free-tier.md` §4) — all state here is ephemeral.
Protocol version: **1** (`PROTOCOL_VERSION`). Any breaking change bumps it; the server rejects mismatched clients with `protocol_mismatch`.

## 1. Rooms

| Room | Purpose | Capacity | Lifetime |
|---|---|---|---|
| `party` (`ROOM_PARTY`) | One per live party: roster, readiness, coarse-cell sharing, run control, verification | `parties.max_size` (≤ 6) | Created on first member connect; disposed 5 min after last member leaves |

There is deliberately **no global/district room** in v1: no stranger-visible presence, so nothing to stalk. (A district room, if ever added, would carry counts only, never positions — requires a privacy review.)

## 2. Connection & auth
```ts
client.joinById(partyRoomId, { protocol: 1, joinTicket, partyId })   // PartyJoinOptions
```
`onAuth` (server): validate options with `PartyJoinOptions` → verify the **join ticket** (Ed25519 signature with the web app's *public* key, `aud`, `exp ≤ 60 s`, unused `jti`) → attach `{userId, isGuest, blocked[]}` from the ticket claims. **No database lookup** (the room has no DB access); party membership/blocks are asserted inside the signed ticket. Failure → close code 4401 (unauthorized) / 4403 / 4426 (protocol mismatch). The ticket is never placed in room state or logs.

**Reconnection:** `allowReconnection(client, 60)`. On drop the member is marked `connected:false`; coarse-cell sharing stops immediately. Clients fetch a new ticket then rejoin. **If the host restarted or slept, rooms are gone**: the client re-creates/rejoins and the roster rebuilds from the next tickets (membership truth is in Postgres, served by the web app).

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
| `run.changed` | `{runId}` | member | 6 / 30 s | **untrusted hint** relayed to other members after the sender's HTTP verification succeeded; receivers must refetch from the API |
| `ping.emote` | `{emote}` | member | 4 / 10 s | relays one of `wave|here|wait|go|help` — the only member-to-member communication |

Rate limits live in `C2S_RATE_LIMITS`; exceeding returns `server.error{rate_limited}` (no strike for the first breach).

## 5. Server → Client messages
| type | payload | Notes |
|---|---|---|
| `party.snapshot` | `{party: PartyView}` | on join/reconnect, and after roster changes |
| `party.member.cell` | `{userId, cell: CoarseCell\|null}` | `null` = stopped sharing. Only to *other* members; never to the owner, never persisted |
| `party.member.emote` | `{userId, emote}` | |
| `party.kicked` | `{reason}` | followed by close |
| `run.changed` | `{runId, by}` | relayed hint; never carries progress data |
| `server.error` | `{code, message, ref?}` | `ErrorCode` enum; `message` is user-safe; `ref` correlates with server logs |
| `server.heartbeat` | `{serverTs}` | |

## 6. Verification (moved out of Colyseus)
Verification is `POST /api/runs/:id/steps/:id/verify` in Next.js (`VerifyGeofenceInput`/`VerifyCodeInput` → `VerificationResult`, see `architecture.md` §4.4). Replay protection by `attemptNonce`, single-use QR `jti`; no coordinates stored. This room only relays the `run.changed` hint.

## 7. Error codes
`bad_request`, `unauthorized`, `forbidden`, `rate_limited`, `not_in_party`, `not_leader`, `protocol_mismatch`, `internal`. Close codes: 4401, 4403, 4426, 4429 (strikes).

## 8. Example exchange
```jsonc
// C → S (after a successful HTTP verification)
{ "type": "run.changed", "payload": { "runId": "…" } }
// S → other members
{ "type": "run.changed", "payload": { "runId": "…", "by": "…" } }
```

## 9. Testing
Contract tests round-trip every schema with valid/invalid fixtures; a headless client harness (colyseus.js + vitest) drives full scenarios: join → ready → start → verify (accepted/rejected/replay) → reconnect → kick; load test 200 rooms × 4 clients at the update cap on a 1-vCPU instance to confirm the budget.
