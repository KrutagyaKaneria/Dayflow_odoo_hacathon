# Shared conventions (Phase 01–03)

This folder defines cross-cutting conventions that every module added from Phase 02
onward must follow.

## Error / response envelope

All endpoints return JSON.

**Success** — the handler returns its payload directly:

```json
{ "status": "ok", "db": "connected" }
```

**Error — single consistent envelope everywhere:**

```json
{
  "error": {
    "message": "Human-readable message",
    "code": "MACHINE_READABLE_CODE"
  }
}
```

Use `sendError(res, statusCode, code, message)` from `src/shared/response.js`.

## HTTP status conventions

| Status | Meaning |
|---|---|
| 200 | Success |
| 400 | Validation error (`VALIDATION_ERROR`) |
| 401 | Not authenticated (`UNAUTHORIZED`) — Phase 02 |
| 403 | Authenticated but not allowed (`FORBIDDEN`) — Phase 03 |
| 404 | Unknown resource (`NOT_FOUND`) |
| 500 | Unexpected server error (`INTERNAL_ERROR`) |
| 503 | Downstream dependency down, e.g. DB (`SERVICE_UNAVAILABLE`) |

## Authorization primitives (`src/shared/auth/`, Phase 03)

Every endpoint that needs protection imports these — do not write a new ad hoc role or
ownership check in a route file. See the module docstrings for full detail.

- `requireAuth` — verifies the Bearer access token (reuses Phase 02's `verifyAccessToken`),
  populates `req.user = { id, role, organizationId }`. Must run first in the chain.
- `requireRole(...allowedRoles)` — must run after `requireAuth`. Fails closed (403, not a
  crash) if `req.user` is somehow missing, as a defensive check — this is not a substitute
  for `requireAuth`.
- `requireSelfOrRole(getResourceOwnerId, ...allowedRoles)` — the "caller owns this resource,
  or holds a privileged role" pattern for Phase 04+ (profile, attendance, leave, salary).
  `getResourceOwnerId(req)` may be sync or async. No endpoint uses this yet as of Phase 03 —
  it exists so Phase 04 can import it directly rather than reimplement ownership checks.

**401-vs-403 convention** — `[RECOMMENDATION pending D-20]`, adopted this phase and applied
consistently everywhere above:

| Status | Meaning |
|---|---|
| 401 `UNAUTHORIZED` | No valid token at all — `requireAuth` failure |
| 403 `FORBIDDEN` | Valid token, but wrong role or not the resource owner — `requireRole` / `requireSelfOrRole` failure |

`TODO(D-20)`: confirm this convention before Phase 04 builds user-facing error states on top
of it — it is a documented default, not a final decision.

## What does NOT exist yet (by design)

- CORS / rate limiting / security middleware — Phase 10. The only exception is the
  bare-minimum local-dev CORS allow in `src/app.js`, marked `TEMP - revisit in Phase 10`.
- Audit logging (D-23) and account lockout — Phase 10.
- Field-level / resource-specific business rules (e.g. which profile fields an employee may
  edit) — Phase 04. `src/shared/auth/` only builds role-level and ownership-level primitives.
