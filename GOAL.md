# GOAL: Blueprint, a schematic builder bot

Build a self-hosted service where a Mineflayer bot joins a Minecraft Java server, reads a .litematic or .schem file and builds the structure. Two modes per session:
- op: bot has operator rights and places blocks with /setblock and /fill
- survival: bot pulls materials from a chest and places blocks like a player
Controlled through an HTTP API. Deployed on a Hetzner server with Dokploy (Docker).

## Stack
- TypeScript, Node 22, pnpm
- mineflayer + mineflayer-pathfinder
- nucleation (WASM) for .litematic/.schem parsing
- Hono API, Postgres (Drizzle), BullMQ + Redis
- Docker Compose: api, worker, postgres, redis, test server
- Redis and Postgres on the internal network only, never a public port

## Target server
Vanilla/Paper, pinned to the newest version Mineflayer officially supports. Offline-mode test server in docker-compose, bot opped there.

## Milestones (in order, do not start the next until the current one passes)
M1: Op mode. Bot joins, parses a schematic, builds it with /setblock including full block states, merges uniform runs into /fill. Rate-limited and configurable to avoid server lag. Supports origin and rotation.
M2: Verification pass shared by both modes: compare world to schematic, report and fix diffs.
M3: API: POST /schematics (returns size + material list), POST /sessions {server, schematicId, origin, rotation, chestPos, mode: op|survival}, GET /sessions/:id, pause/resume/cancel, SSE progress. Progress persisted, resumes after disconnect.
M4: Survival basics: place full solid blocks from inventory, chest refill loop, report missing items and wait.
M5: Survival stateful blocks (stairs, slabs, log axis, doors, torches, buttons) and placement order: bottom-up, supports first, gravity blocks handled, attachables last. Temporary scaffolding for unreachable blocks.

## Definition of done
- `pnpm test` passes, including integration tests that build tests/fixtures/small_house.litematic on the test server in both modes: op at 100% and survival at least 99% block-state accuracy. Generate the fixture with nucleation if none exists.
- `docker compose up` starts the full stack from a clean checkout.
- README covers setup, env vars and API examples with curl.
- No secrets in the repo.

## Rules
- If it works, leave it alone. Do not rewrite working modules or swap libraries unless a milestone is blocked; justify it in PROGRESS.md.
- Small commits per step with clear messages.
- Keep PROGRESS.md current: milestone, done, next, blockers, latest accuracy per mode.
- If stuck over 30 minutes on one issue, log it, try one alternative, then move on or ask.
- No features outside this goal.

## Checkpoint loop
1. Read GOAL.md and PROGRESS.md.
2. Verify, don't trust: run `pnpm build`, `pnpm test` and the integration test. Record pass/fail and block accuracy %.
3. Check the current milestone against its criteria. Mark it done only with evidence (test output, commit hash).
4. Check for drift: work outside the goal, rewrites of working code, exposed ports, secrets in the repo. Fix or flag it.
5. Append a timestamped entry to PROGRESS.md: status, evidence, blockers, next 1 to 3 steps.
6. If the full Definition of done is met: write a final report and stop the loop.
7. If the same blocker appears in 3 checkpoints in a row: stop and ask Jon instead of looping.
8. Otherwise continue with the next step.
