# PROGRESS

## Status

| Milestone | State | Evidence |
|---|---|---|
| M1 Op mode | done | `c88dbc7`, `tests/integration/op.test.ts`: 335/335 (100%) at rotations 0/90/270 |
| M2 Verification | done | `6fbcf73`, `tests/integration/verify.test.ts`: detects 1 missing, 1 wrong block, 1 wrong state, 1 obstruction; fixes to 100% |
| M3 API | next | |
| M4 Survival basics | pending | |
| M5 Survival stateful | pending | |

Latest accuracy: op 100% (335/335), survival not measured yet.

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
