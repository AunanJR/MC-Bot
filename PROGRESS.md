# PROGRESS

## Status

| Milestone | State | Evidence |
|---|---|---|
| M1 Op mode | done | `c88dbc7`, `tests/integration/op.test.ts`: 335/335 (100%) at rotations 0/90/270 |
| M2 Verification | done | `6fbcf73`, `tests/integration/verify.test.ts`: detects 1 missing, 1 wrong block, 1 wrong state, 1 obstruction; fixes to 100% |
| M3 API | done | `dd313cf`, `acbfcbe`, `tests/integration/api.test.ts`: upload, validation, pause/resume, dropped connection resumed at step 15, SSE, cancel; session accuracy 1.0 |
| M4 Survival basics | done | `2d2476c`, `tests/integration/survival-basic.test.ts`: 82/82 with `carrySlots=2` (3 chest trips), reported missing `{oak_planks: 21}`, waited, finished after restock |
| M5 Survival stateful | done | `947db8c`, `9a7bab8`, `tests/integration/survival-house.test.ts`: small_house 335/335 (100%) at rotations 0 and 90; `survival-scaffold.test.ts`: 19/19, 5 scaffold blocks removed, none left |
| Definition of done | met | see final report below |

Latest accuracy: op 100% (335/335), survival 100% (335/335).

## Decisions

- **Server version.** mineflayer 4.39.0's newest tested version is `26.1` (protocol 775). The test server
  runs vanilla **26.1.1** (also protocol 775) from `phlak/minecraft:26.1.1`, whose image already
  contains the server jar. Reason: this sandbox's egress policy blocks `piston-data.mojang.com`,
  `fill.papermc.io` and `fill-data.papermc.io`, so images that download the jar at startup
  (itzg, marctv Paper, where Paperclip fetches the Mojang jar) cannot start here. The bot connects
  with `version: '26.1'`.
- **Op placement flag.** `/setblock` and `/fill` use `strict` by default (added in 1.21.5): exact states,
  no neighbour updates, no falling sand. `replace` is configurable and also reaches 100% on the fixture.
- **Accuracy metric.** Share of the schematic's non-air blocks whose full canonical block state
  (id plus every property, defaults filled from minecraft-data) matches the world. Stray blocks in the
  schematic's air cells are reported separately as obstructions.
- **Integration tests** start a throwaway container of `docker/mc` on a random loopback port
  (`tests/integration/global-setup.ts`), or use `MC_HOST`/`MC_PORT` if set.

## Log

### 2026-09-30T19:35Z checkpoint 1
- Status: M1 and M2 done.
- Evidence: `pnpm build` ok; unit tests 14/14; integration `op.test.ts` 3/3 at 100%, `verify.test.ts` 1/1.
- Blockers: none. Egress blocks Mojang/PaperMC downloads; worked around with a baked-in jar image (see Decisions).
- Next: M3 (Drizzle schema, BullMQ worker, Hono API with SSE, resume after disconnect).

### 2026-09-30T20:28Z checkpoint 2: final report
- Status: M1 to M5 done; the Definition of done is met.
- Evidence:
  - `pnpm build` ok. `pnpm test` without env overrides (starts its own test server, Postgres, Redis):
    **10 files, 34 tests passed**, 514 s, exit 0. Op small_house 100% at 0/90/270; survival small_house 100% at 0/90
    (the test requires 99% or more).
  - `docker compose up -d`: api, worker, postgres (healthy), redis (healthy) and mc all up; `/health` ok. Postgres
    and Redis publish no ports (internal `backend` network). Through the API against the compose `mc` service:
    op session rotation 90 finished `completed`, accuracy 1; survival session rotation 180 finished `completed`,
    accuracy 1, 335/335, after resuming it from `failed` (the chest was not set up on the first try).
  - A clean `git clone` builds both images and passes `pnpm test:unit` (22/22).
  - README covers setup, env vars and curl examples. A secret scan of tracked files found none.
- Drift check (flagged, kept):
  - `API_TOKEN` (optional bearer auth) and `GET /sessions` (list) go slightly past the listed endpoints. They are
    small and needed to expose a bot-controlling API on a public Hetzner host.
  - Compose falls back to `POSTGRES_PASSWORD=blueprint`, so `docker compose up` works from a clean checkout. The
    database is on an internal network only; README and `.env.example` say to set a real password.
  - The Dockerfile has an optional BuildKit secret `extra_ca` for TLS-intercepting proxies (needed in this sandbox).
    Without it the build is unchanged.
  - No working module was rewritten or had its library swapped. `buildOp`'s verify loop moved into the shared
    `verifyAndFix` during M2, because M2 requires one pass shared by both modes.
- Environment notes: Docker Hub rate-limited pulls (429) for a while; `redis:7-alpine` pulled later. In this sandbox,
  images were built with `--secret id=extra_ca` before `docker compose up`.
- Blockers: none.
- Next: none required. Possible follow-ups outside this goal: block entity data (sign text, chest contents) and
  online-mode (Microsoft) accounts.
