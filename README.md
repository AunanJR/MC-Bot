# Blueprint

A self-hosted service that sends a [Mineflayer](https://github.com/PrismarineJS/mineflayer) bot onto a
Minecraft Java server to build a `.litematic` or `.schem` schematic. Each build session runs in one of two modes:

- **op**: the bot is an operator and places blocks with `/setblock` and `/fill` (uniform runs merged into
  `/fill`), with the exact block states from the file. The command rate is limited and configurable.
- **survival**: the bot takes materials from a chest and places blocks like a player: bottom-up, supports
  first, gravity blocks after what holds them, attachables (torches, doors, buttons…) last. It sets stair,
  slab, log, door, torch and button states through where it clicks and where it looks. It towers up with
  temporary scaffolding when a block is out of reach, then removes the scaffolding.

Both modes end with the same verification pass. It compares every block state in the world with the
schematic, reports the differences, fixes them (op: `/setblock`; survival: dig and re-place), and checks again.

You control everything through an HTTP API. Build progress is stored in Postgres and streamed over SSE.
If the bot is disconnected, the build resumes where it stopped.

## Architecture

| Service    | What it does                                                                    | Network            |
|------------|---------------------------------------------------------------------------------|--------------------|
| `api`      | Hono HTTP API, runs DB migrations on start                                      | `backend`, public  |
| `worker`   | BullMQ worker, one Mineflayer bot per build session                             | `backend`, default |
| `postgres` | Schematics and sessions (Drizzle)                                               | `backend` only     |
| `redis`    | BullMQ queue, progress events, pause/resume/cancel signals                      | `backend` only     |
| `mc`       | Offline-mode vanilla test server (26.1.1); the bot account is opped             | default, `:25565`  |

`backend` is an `internal` Docker network. Postgres and Redis publish no ports.

**Minecraft version.** The bot speaks protocol `26.1`, the newest version mineflayer 4.39 lists as tested.
The bundled test server runs 26.1.1, which uses the same protocol (775). Use `MC_VERSION` or the session's
`server.version` to target another version that mineflayer supports.

## Quick start

```bash
cp .env.example .env        # optional; every variable has a default
docker compose up -d --build
curl -s localhost:3000/health   # {"ok":true}
```

This starts the API on `:3000` and a test server on `:25565`. Connect to the test server with a Java client
(offline mode) to watch the bot. Inside the stack, the worker reaches the test server as host `mc`.

## Environment variables

| Variable                 | Default         | Used by       | Meaning                                                         |
|--------------------------|-----------------|---------------|-----------------------------------------------------------------|
| `DATABASE_URL`           | set by compose  | api, worker   | Postgres connection string                                      |
| `REDIS_URL`              | set by compose  | api, worker   | Redis connection string                                         |
| `POSTGRES_PASSWORD`      | `blueprint`     | compose       | Password of the internal database. Set your own when deploying. |
| `API_TOKEN`              | empty           | api           | If set, every request needs `Authorization: Bearer <token>`     |
| `API_PORT`               | `3000`          | compose       | Host port of the API                                            |
| `PORT`                   | `3000`          | api           | Port the API listens on inside the container                    |
| `MC_PORT`                | `25565`         | compose       | Host port of the test server                                    |
| `BOT_USERNAME`           | `Blueprint`     | api, worker, mc | Default bot name (offline mode); opped on the test server     |
| `MC_VERSION`             | `26.1`          | api, worker   | Default protocol version for sessions                           |
| `OP_COMMANDS_PER_SECOND` | `20`            | worker        | Default op-mode command rate (a `/fill` counts as one)          |
| `WORKER_CONCURRENCY`     | `2`             | worker        | Sessions one worker builds at the same time                     |
| `RECONNECT_ATTEMPTS`     | `10`            | worker        | Reconnects after a dropped connection before a session fails    |
| `MAX_SCHEMATIC_BYTES`    | `20971520`      | api           | Upload size limit                                               |

The repository contains no secrets. `.env` is git-ignored.

## API

The examples assume `API=http://localhost:3000`. If `API_TOKEN` is set, add `-H "Authorization: Bearer $API_TOKEN"`.

### Upload a schematic

```bash
curl -s -F file=@tests/fixtures/small_house.litematic $API/schematics
```

```json
{
  "id": "4f0c…",
  "name": "small_house.litematic",
  "format": "litematic",
  "size": { "x": 9, "y": 6, "z": 9 },
  "blockCount": 335,
  "materials": [{ "id": "minecraft:cobblestone", "count": 81 }, …],
  "items": [{ "id": "minecraft:cobblestone", "count": 81 }, …, { "id": "minecraft:oak_door", "count": 1 }],
  "unplaceable": []
}
```

`materials` counts blocks. `items` is what a survival build needs: wall torches count as torches, a door
counts once, a double slab counts two slabs. `unplaceable` lists blocks that no item can place. The raw file
can also be sent as the request body: `curl --data-binary @house.schem "$API/schematics?name=house.schem"`.

`GET /schematics/:id` returns the same summary.

### Start a session

Op mode (the bot must be an operator on the target server):

```bash
curl -s -X POST $API/sessions -H 'content-type: application/json' -d '{
  "server": { "host": "mc", "port": 25565 },
  "schematicId": "<id>",
  "origin": { "x": 40, "y": -60, "z": 40 },
  "rotation": 90,
  "mode": "op",
  "options": { "commandsPerSecond": 20 }
}'
```

Survival mode (put the materials, plus some dirt for scaffolding, into the chest at `chestPos`):

```bash
curl -s -X POST $API/sessions -H 'content-type: application/json' -d '{
  "server": { "host": "mc", "port": 25565, "username": "Builder" },
  "schematicId": "<id>",
  "origin": { "x": 100, "y": -60, "z": 40 },
  "rotation": 0,
  "chestPos": { "x": 97, "y": -60, "z": 52 },
  "mode": "survival"
}'
```

| Field          | Required | Notes                                                                   |
|----------------|----------|-------------------------------------------------------------------------|
| `server`       | yes      | `host`, `port` (25565), `username` (`BOT_USERNAME`), `version` (`MC_VERSION`) |
| `schematicId`  | yes      | From `POST /schematics`                                                 |
| `origin`       | yes      | World position of the rotated build's lowest north-west corner         |
| `rotation`     | no       | `0`, `90`, `180` or `270` degrees, clockwise seen from above           |
| `chestPos`     | survival | Supply chest                                                           |
| `mode`         | yes      | `op` or `survival`                                                     |
| `options`      | no       | See below                                                              |

Op options: `commandsPerSecond`, `placementFlag` (`strict`, the default, places exact states without
block updates; `replace` lets the server update neighbours), `mergeFills` (default `true`),
`maxFillVolume` (≤ 32768), `clearArea` (default `true`: fill the build box with air first), and `fixPasses`
(default 3).

Survival options: `reach` (4.5), `carrySlots` (27 inventory slots per chest trip), `waitPollMs` (how often to
recheck the chest while items are missing), `fixPasses` (3), and `maxAttempts` (4 per block).

### Follow a session

```bash
curl -s $API/sessions/<id>
curl -N $API/sessions/<id>/events         # Server-Sent Events
curl -s $API/sessions                     # latest 50
```

A session has a `status` (`queued`, `running`, `paused`, `waiting_for_items`, `completed`, `failed`,
`cancelled`), a `stage` (`connecting`, `clearing`, `building`, `verifying`, `fixing`, `waiting_for_items`,
`done`), and `progress` (`done`, `total`, `percent`, `cursor`). It also has `accuracy` (0..1, full block
states) and a `report`: counts of missing, wrong block, wrong state and obstructions, plus up to 100 diffs
with position, expected state and actual state. While a survival build waits for items, `missing` lists what
to put in the chest.

The SSE stream sends `session` (a snapshot) first, then `progress`, `log` and `status` events. It closes
when the session ends.

### Pause, resume, cancel

```bash
curl -s -X POST $API/sessions/<id>/pause
curl -s -X POST $API/sessions/<id>/resume   # also retries a failed session from its saved cursor
curl -s -X POST $API/sessions/<id>/cancel
```

## Resuming

The worker saves the build cursor (the next command or block) to Postgres as it goes. If the bot gets
disconnected or kicked, the worker reconnects with backoff (`RECONNECT_ATTEMPTS`) and continues from the
cursor. Commands lost in flight get caught by the verification pass. If the worker process dies, BullMQ
hands the job to another worker, which resumes from the same cursor. Survival builds skip blocks that are
already correct in the world, so a resumed build never places twice.

## Development

Requirements: Node 22, pnpm 10, Docker.

```bash
pnpm install
pnpm build          # tsc -> dist/
pnpm test           # unit + integration
pnpm test:unit
pnpm test:integration
pnpm tsx scripts/generate-fixture.ts   # regenerate tests/fixtures/small_house.litematic with nucleation
```

The integration tests start throwaway containers (test server, Postgres, Redis) on random loopback ports and
remove them afterwards. To reuse running services, set `MC_HOST`/`MC_PORT`, `DATABASE_URL` and `REDIS_URL`.
Set `KEEP_TEST_SERVER=1` to keep the containers. The tests build `tests/fixtures/small_house.litematic` in op
mode (rotations 0/90/270, 100% required) and in survival mode (rotations 0/90, at least 99% required). They
also cover the verification pass, the API (pause/resume, a dropped connection, SSE, cancel), chest refills,
missing items and scaffolding.

If you build behind a TLS-intercepting proxy, pass its CA to the image build:
`docker build --secret id=extra_ca,src=/path/to/ca.crt -t blueprint-app .`

## Deploying on Hetzner with Dokploy

1. In Dokploy, create a **Compose** service from this repository (compose file `docker-compose.yml`).
2. Set `POSTGRES_PASSWORD` and `API_TOKEN` in the service's environment.
3. Attach a domain to the `api` service on port 3000, or keep `API_PORT` published and firewall it.
4. The `mc` service is a test server. Remove it or leave it stopped when you build on your own servers. Its
   port is the only other one that is published.

Postgres and Redis stay on the internal network. Their data persists in the `pgdata` and `redisdata` volumes.

## Limits

- Block entity data (chest contents, sign text, banner patterns) is not copied; block states are.
- Survival mode derives states from how vanilla places blocks. Blocks whose state depends on neighbours
  (fence connections, stair corners) come out right when the schematic itself is consistent with those rules.
- Offline-mode (`auth: offline`) accounts only.
