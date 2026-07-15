# Refresh Token Rotation — Log Storm Fix

**Date:** 2026-07-15  
**Library:** `@beyondbetter/bb-mcp-server` (observed on 0.1.19)  
**Affected file (server):** `src/lib/auth/TokenManager.ts`  
**Client to update separately:** BB API (the shared multi-user MCP client)

---

## Symptom

Production logs fill with paired errors:

```
OAuthProvider: Token request failed ... Invalid or expired refresh token
  at OAuthProvider.handleRefreshTokenGrant (OAuthProvider.ts:889)
TokenManager: Refresh token not found  { refreshTokenPrefix: "mcp_refresh_..." }
```

Nothing is actually *expiring*. The refresh token is being **deleted by a prior
rotation and then presented again**.

---

## Root cause: non-idempotent refresh-token rotation

`TokenManager.refreshAccessToken()` previously did:

1. Look up the presented refresh token in Deno KV — if absent, return
   `"Invalid or expired refresh token"`.
2. Mint a **new** access token **and a new refresh token**.
3. **Immediately hard-delete** the old refresh token (single-use rotation).

Every successful refresh therefore *consumes* the presented token and issues a brand-new
one. The `"Refresh token not found"` storm is what happens whenever an **already-rotated
(deleted)** token is presented a second time. There was no grace window, no reuse
detection, and no idempotency.

Refresh-token rotation itself is **correct and required** — OAuth 2.1 §4.3.1 and the MCP
2025-11-25 authorization spec mandate it for public clients. So the fix is to make rotation
**idempotent**, not to remove it.

### Why Baxter's setup triggers it constantly

Access tokens live 1 hour, refresh tokens 30 days, so the **single shared BB API client**
refreshes roughly hourly *per Baxter user*. Three failure modes, any of which produces
exactly these logs:

- **Concurrency race (most likely):** two concurrent BB API requests for the same user both
  hit an expired access token and refresh with the *same* current refresh token. The first
  rotates + deletes it; the second finds it gone → "not found".
- **Client re-presenting the old token:** rotation returns a *new* refresh token every time.
  If the client ever re-sends the previous one, *every* subsequent call fails → sustained
  storm.
- **Lost response:** if a token response never reaches the client (network blip / restart
  mid-flight), the client retries with a token the server has already deleted → permanent
  failure for that chain.

---

## Fix A — server side (IMPLEMENTED in `TokenManager.ts`)

Make rotation idempotent with a short grace window instead of an immediate hard delete.

**Behaviour:** on rotation, the old refresh-token record is kept for a short grace window
(default **60s**), rewritten to record what it was `rotated_to` (the new access token, which
includes the new refresh token). If that same old token is presented again **within** the
grace window, the server **replays** the already-issued tokens instead of erroring. After
the grace window the record's TTL expires and the token is gone (single-use is preserved,
just with a brief idempotency buffer).

### Changes applied

1. **`MCPRefreshToken` interface** — two optional fields:
   ```ts
   /** New access token (incl. new refresh_token) issued when this token was rotated. */
   rotated_to?: MCPAccessToken;
   /** Timestamp at which this refresh token was rotated (superseded). */
   superseded_at?: number;
   ```

2. **`TokenConfig` interface** — configurable grace window:
   ```ts
   /** Grace window (ms) for idempotent rotation replay. Default 60000 = 60s. */
   refreshTokenRotationGraceMs?: number;
   ```

3. **Constructor default:**
   ```ts
   refreshTokenRotationGraceMs: config.refreshTokenRotationGraceMs ?? 60 * 1000,
   ```

4. **`refreshAccessToken()` — idempotent replay block** (added immediately after
   `const now = Date.now()`): if `refreshTokenData.rotated_to` is set and
   `now - superseded_at <= graceMs`, log a `warn` and return
   `{ success: true, accessToken: refreshTokenData.rotated_to }`. If past the grace window,
   delete the record and return `"Invalid or expired refresh token"`.

5. **Rotation itself** — instead of `kvManager.delete(...)`, the old record is written back
   as `{ ...refreshTokenData, rotated_to: newAccessToken, superseded_at: now }` with
   `{ expireIn: graceMs }`. Also **fixes a latent bug**: the new access token is now minted
   passing `refreshTokenData.scope` (previously the scope silently reset to the default
   `'read write'` on every refresh).

> `OAuthProvider` constructs the `TokenManager` config with only the three existing expiry
> fields, so the new grace field defaults internally — **no `OAuthTypes` / `OAuthProvider`
> change required**.

### Concurrency note

Two *simultaneous* reads (before either write lands) will each mint independent, valid
token sets — harmless double-mint; both clients get working tokens. The grace replay covers
the far more common near-serial case (request B arrives just after A committed the rotation).
If you later want strict single-mint semantics, wrap steps in a Deno KV atomic
check (`kv.atomic().check(...)`) so only one rotation commits; not required to stop the storm.

### Post-change checklist (run manually — not runnable from BB's execute allow-list)

```bash
cd bb-mcp-server
deno task check              # or: deno task tool:check-types
deno task tool:format
deno task test               # add/adjust TokenManager tests (see below)
```

**Suggested tests** (tests/ … TokenManager):
- Rotating a refresh token then presenting the OLD token again within grace → returns the
  same `accessToken` (replay), `success: true`.
- Presenting the old token after the grace window → `success: false`,
  `"Invalid or expired refresh token"`.
- Rotation preserves the original `scope` (regression test for the scope-reset bug).

---

## Fix B — BB API client: serialise refresh per user (single-flight)

**Where:** BB API OAuth client / token store (BB repo — not in this workspace).

**Problem:** the shared BB API can fire multiple concurrent requests for the same Baxter
user; each independently notices the access token is expired and launches its own refresh
with the same refresh token → the race described above.

**Fix:** ensure **only one refresh is in flight per user at a time**. Concurrent callers
await the same in-flight refresh promise rather than starting their own.

```ts
// Sketch — per-user single-flight refresh
private inFlightRefresh = new Map<string, Promise<Tokens>>();

async getValidAccessToken(userId: string): Promise<string> {
  const tokens = await this.store.get(userId);
  if (tokens && !this.isExpiring(tokens)) return tokens.access_token;

  let refresh = this.inFlightRefresh.get(userId);
  if (!refresh) {
    refresh = this.doRefresh(userId, tokens!.refresh_token)
      .finally(() => this.inFlightRefresh.delete(userId));
    this.inFlightRefresh.set(userId, refresh);
  }
  const fresh = await refresh;      // concurrent callers await the SAME refresh
  return fresh.access_token;
}
```

Note: single-flight is per-process. With BB API running blue+green, a refresh could still
race *across* the two instances — but the server-side grace window (Fix A) absorbs that
cross-instance case, so per-process single-flight + Fix A together are sufficient.

---

## Fix C — BB API client: always persist the NEW refresh token

**Where:** BB API token store (BB repo).

**Problem:** because rotation issues a **new** refresh token on every refresh, the client
MUST overwrite its stored refresh token with the new one from each token response. If it
ever re-presents a prior refresh token, every call fails.

**Fix / checklist:**
1. On **every** successful token response, persist BOTH the new `access_token` **and** the
   new `refresh_token` atomically, keyed by user. Never keep the previous refresh token.
2. Only remove/replace the old token **after** the new one is durably stored (write-then-
   swap), so a crash mid-refresh can't leave the user with no usable token.
3. On a refresh HTTP call that fails at the network layer, do **not** assume the rotation
   didn't happen — the server may have rotated before the response was lost. Prefer to retry
   the refresh (the server grace window will replay the new tokens) rather than immediately
   re-presenting the old token in a tight loop.
4. Ensure the store is keyed strictly per user so one user's rotation can't clobber another.

---

## Fix D — shared Deno KV (CONFIRMED OK)

Blue and green MCP-server deployments share the **same `Deno.KV`**, so a refresh token
minted by one instance is visible to the other. No change required. (This is also what makes
the cross-instance race in Fix B safe once Fix A is in place.)

---

## Summary

| Fix | Layer | Status |
|-----|-------|--------|
| A — idempotent rotation + grace window (+ scope-preserve) | bb-mcp-server `TokenManager.ts` | **Implemented; needs type-check / format / tests** |
| B — per-user single-flight refresh | BB API client | To do in BB repo |
| C — persist new refresh token; safe retry | BB API client | To do in BB repo |
| D — shared Deno KV across blue/green | infra | Confirmed OK, no change |

A alone stops the log storm; B + C remove the race at its source and make the client
robust. D is already satisfied.
