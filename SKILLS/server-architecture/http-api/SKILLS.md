# server-architecture/http-api

> Model: 1.0.0 · Status: draft

## Purpose

The REST surface of the game: endpoints, request/response contracts, authentication middleware, and how static assets are served. It is the contract every non-socket client call depends on — including player base colour, troop deployment, military actions, and border geometry queries.

## Affects

Backend

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.2.0

Removing/renaming an endpoint or changing a response shape = **major**; new endpoints = **minor**. Adding `POST /api/player/color`, `POST /api/troops/deploy`, `POST /api/military/action`, `GET /api/military/status`, and `GET /api/borders` is **minor**.

## Ideas

- Versioned prefix (`/api/v1`) before the surface grows
- JSON error envelope `{error, code}` (today errors are plain text, successes JSON)
- Rate limiting / lockout on login and register
- CORS middleware for third-party clients; OpenAPI spec for the endpoint set
- Fix `register` error mapping (see Issues) by typing DB errors

## Concerns

- Auth tokens are opaque random strings in process memory (`backend/pkg/auth/auth.go` L26) — the API contract breaks across restarts (everyone logged out) and cannot span multiple instances.
- No pagination/limits on any endpoint (fine at 15 kingdoms, latent at scale).
- Static-file catch-all and the API share one router — route ordering is load-bearing.
- Military action endpoints must validate that the acting player owns the source territory and has troops deployed on the border side facing the target — this gate has no implementation yet.

## Issues

- **Claim validation gap**: `AssignCountryHandler` verifies only that the *user* has no country (`backend/internal/handlers/handlers.go` L151-159); it never checks whether the *country* is already held, and `AssignCountryToPlayer` doesn't touch `countries.owner_id` (L161-166) — two players can claim the same kingdom and the map never reflects either (details in `borders`).
- **Error misreporting**: any `CreateUser` failure (including DB outage) returns `409 "Username or email already exists"` (`handlers.go` L52-56).
- **No rate limiting** on `/api/login` or `/api/register` (`handlers.go` L29-104) — bcrypt cost 14 makes unauthenticated login attempts an easy DoS vector.
- **Static catch-all masks API 404s**: `r.PathPrefix("/")` (`backend/cmd/server/main.go` L97) intercepts unknown `/api/...` paths and serves frontend HTML/404 instead of a JSON error.
- **Mixed content types**: failures come back as `http.Error` plain text while success is JSON — clients must handle both.
- Logout *does* revoke (`RevokeToken`, `handlers.go` L106-114), but only until the next restart (in-memory store).

## Result

Working endpoints (verified live): public `GET /api/health`, `POST /api/register`, `POST /api/login`, `GET /api/countries?era=…`; protected via `AuthMiddleware` (Bearer parsing + validation, `backend/pkg/auth/auth.go` L78-101): `POST /api/logout`, `POST /api/assign-country`, `GET /api/my-country`, `POST /api/heartbeat`; bcrypt-hashed passwords (cost 14); protected routes grouped under `PathPrefix("/api")` with subrouter middleware (`backend/cmd/server/main.go` L86-91); static frontend served at `/`.

Planned endpoints (not yet implemented): `POST /api/player/color` (set base colour), `POST /api/troops/deploy` (assign army strength to N/S/E/W border), `POST /api/military/action` (invade or expand), `GET /api/military/status` (army size label + strength + troop positions), `GET /api/borders` (current border line geometry).
