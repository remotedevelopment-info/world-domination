# server-architecture

> Model: 1.0.0 · Status: draft

## Purpose

The overall structure of the Go backend service: process layout, package boundaries, routing, configuration, and packaging. It defines how a request or a tick travels through the code and where new backend functionality should live.

## Affects

Backend

## Released/Intended SEMVER

- **Released:** —
- **Intended:** 0.1.0

## Ideas

- Multi-stage Docker build (scratch/alpine runtime image)
- Central config package with validation instead of scattered `os.Getenv`
- Structured logging, metrics, and pprof endpoints
- Backend healthcheck wired into `docker-compose.yml`
- Interfaces per package to enable unit tests; CI running `go vet` + tests
- Graceful drain on shutdown (currently `server.Close` only)

## Concerns

- Single process, single instance: tick state and token store are in-memory, so there is no horizontal scaling path today.
- Schema-as-code (`InitSchema` with `CREATE TABLE IF NOT EXISTS`) instead of migrations — evolving the schema will require manual DDL.
- Zero tests: no `*_test.go` anywhere in the tree.
- Frontend and backend are versioned in one repo/release — skill SEMVERs track concerns, not deploys.

## Issues

- **Fat runtime image**: the final image is the build image `golang:1.21-alpine` (`backend/Dockerfile` L1) with the toolchain baked in — no multi-stage build.
- **No backend healthcheck**: `docker-compose.yml` gives postgres a healthcheck but the backend service none, so orchestrators can't detect a hung server.
- **Flag/env precedence is accidental**: `flag.Parse()` runs *after* the `PORT` default is applied (`backend/cmd/server/main.go` L103-107) — it works, but precedence rules are undefined and untested.
- **Restart loses session + tick**: tokens (`backend/pkg/auth/auth.go` L26) and `currentTick` (`backend/internal/game/engine.go` L47-54) are process-memory only.

## Result

Working single-binary service: entry point `backend/cmd/server/main.go` (router assembly, `/ws`, static file serving, SIGINT/SIGTERM graceful shutdown); packages `internal/database`, `internal/game`, `internal/handlers`, `internal/models`, `pkg/auth`; gorilla/mux routing with an auth middleware subrouter; opaque-token auth; containerized via `backend/Dockerfile` (binary at `/usr/local/bin/server`, immune to the `./backend` bind mount) with `docker-compose.yml` gating startup on a healthy postgres.

Sub-skills: `game-engine`, `database`, `http-api`.
