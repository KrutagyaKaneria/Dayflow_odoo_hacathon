# Shared conventions (Phase 01)

This folder defines cross-cutting conventions that every module added from Phase 02
onward must follow. Only the minimal building blocks exist today.

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

## What does NOT exist yet (by design)

- Full error-handling middleware chain — starts in Phase 02.
- CORS / rate limiting / security middleware — Phase 02/10. The only exception is the
  bare-minimum local-dev CORS allow in `src/app.js`, marked `TEMP - revisit in Phase 10`.
- RBAC enforcement — Phase 03.
