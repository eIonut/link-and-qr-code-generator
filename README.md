# Link and QR generator

A local POC for learning Redis, Kafka, Cloudflare R2, and a Go analytics worker.
Keep the implementation focused on the happy path and basic errors.

Run the frontend, API, MongoDB, Redis, and Kafka with Docker Compose:

```sh
docker compose up --build -d
```

Open http://localhost:8080. The multi-stage image builds with Node.js and pnpm,
then serves only the compiled static files using unprivileged Nginx.

The API is available at http://localhost:3000. Its multi-stage image compiles
TypeScript, installs only production dependencies in the runtime, and runs as
the unprivileged Node.js user.

MongoDB and Redis store their data in named Docker volumes. Redis also enables
append-only persistence. Their host ports bind to localhost:

- MongoDB: `mongodb://localhost:27017/qr_code_generator`
- Redis: `redis://localhost:6379`

From other Compose services, use `mongodb:27017` and `redis:6379` instead.

Kafka runs as one broker/controller in KRaft mode using the pinned
`apache/kafka:4.3.1` image. Records persist in the `kafka_data` volume with
seven-day retention. Host processes connect to `localhost:9092`; Compose
services connect to `kafka:29092`. Both addresses are advertised by Kafka so
clients can reach the broker after fetching its metadata. This follows the
[Apache Kafka Docker setup](https://hub.docker.com/r/apache/kafka/).

The API uses `kafkajs@2.2.4` and initializes `links.created.v1` at startup with
three partitions and replication factor one. It waits for Kafka before
starting its HTTP server; restarting the API leaves an existing topic intact.
Set `KAFKA_BROKERS` to a comma-separated list to override the connection.
Client setup lives in `api/config/kafka.ts`. Publishing `LinkCreated` from
link creation and consuming it in the QR worker are the next steps.

To verify KafkaJS production and consumption from the host:

```sh
docker compose up -d --wait kafka
cd api
pnpm install
pnpm kafka:smoke
```

The check publishes a unique message to `poc.smoke.v1` and verifies the same
message is consumed, following the [KafkaJS quickstart](https://kafka.js.org/docs/getting-started).
It uses a separate topic so test messages do not become QR jobs. To check the
Compose listener with the built API container, run from the repository root:

```sh
docker compose exec api node dist/scripts/kafka-smoke.js
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:29092 --describe --topic links.created.v1
```

KafkaJS 2.2.4 emits a `TimeoutNegativeWarning` from its internal request-queue
timer in this Node 24 setup. Both host and container produce/consume checks
pass; the warning is recorded here so it is recognizable in startup logs.

The API connects to MongoDB using Mongoose before starting its HTTP server. Local development
defaults to `mongodb://127.0.0.1:27017/qr_code_generator`; set `MONGODB_URI` to
override it. Compose supplies the connection URL for the MongoDB service.

Redirects use Redis as a cache. The first request reads MongoDB and saves
`{ id, destinationUrl }` at `link:<shortCode>` for one hour. Later requests
use that cached value. API logs show `cache miss` and `cache hit`. Redis
connects in the background; redirects use MongoDB while Redis is unavailable,
and caching resumes when it reconnects. Cache commands time out after one
second rather than waiting on Redis indefinitely.

Redis now has a 32 MiB cache budget and defaults to `allkeys-lru`. LRU evicts
entries that have not been used recently; LFU favors entries used frequently,
with counters that age over time. Both are approximations provided by Redis,
and eviction under memory pressure is separate from the one-hour TTL.
See [Redis's eviction guide](https://redis.io/docs/latest/develop/reference/eviction/).

To switch the app to LFU, run this from the repository root:

```sh
REDIS_EVICTION_POLICY=allkeys-lfu docker compose up -d redis
docker compose exec redis redis-cli CONFIG GET maxmemory maxmemory-policy
```

Use `allkeys-lru` to switch back. Set `REDIS_MAXMEMORY` to change the budget.
For a lasting choice, put these variables in a root `.env` file; otherwise
future Compose recreations use the defaults. Changing policy takes effect on
the existing cache.

The frontend includes a shadcn/Tailwind URL form, optional title, short-link
result, copy control, QR preview, and PNG download control. The API implements
`POST /api/links`, `GET /api/links/:id`, and `GET /r/:shortCode` from
[the requirements](design/LINK_SHORTENER_REQUIREMENTS.md). Links persist in
MongoDB with one full UUID for both the link ID and public URL code.
Creation validates HTTP/HTTPS URLs and an optional title. Existing
seven-character links still work. Redirects return `302` with `Cache-Control: no-store`.

The QR worker and `GET /api/links/:id/qr/download` endpoint are a later
milestone. Created links currently report QR status `pending`; downloading
remains disabled. Pending/processing QR status is polled every two seconds until ready or failed.

For frontend development, run `pnpm install` and `pnpm dev` in `frontend`.
Vite proxies `/api` to `http://localhost:3000`; the Docker frontend proxies
it to `api:3000`. To use a separate API origin, copy `frontend/.env.example`
to `frontend/.env` and set `VITE_API_BASE_URL` before building. The separate
API must allow the frontend origin through CORS.

For API development, run `pnpm install` and `pnpm dev` in `api`, with MongoDB
and Kafka running. Copy `api/.env.example` to `api/.env` to override the port,
database, `REDIS_URL`, `KAFKA_BROKERS`, or `SHORT_BASE_URL`. The short base URL includes `/r` and is saved with each
new link. For phone access, use a reachable LAN address or deployed domain
before creating links. Compose accepts a `SHORT_BASE_URL` environment override
too. Run `pnpm test` for API behavior tests and `pnpm build` for a typechecked
production build.

API code stays split into `models/`, `routes/`, `controllers/`, `services/`,
`schemas/`, `config/`, `middleware/`, and `tests/`. `app.ts` wires these together.

The learning path keeps Redis redirect caching, Kafka events, a Node QR worker
uploading PNGs to R2, and a Go click-analytics worker. Retry frameworks,
outboxes, advanced validation, and extensive recovery UI are deferred.
See [the requirements](design/LINK_SHORTENER_REQUIREMENTS.md) for the broader
learning guide.

To check link creation and inspect its redirect without following it:

```sh
curl -i http://localhost:3000/api/links \
  -H 'Content-Type: application/json' \
  -d '{"destinationUrl":"https://example.com/portfolio","title":"Portfolio"}'
# Use the shortUrl returned above:
curl -i http://localhost:3000/r/RETURNED_CODE
```

To observe Redis, create a new link and request its short URL twice without
following redirects. Check the logs and remaining cache lifetime:

```sh
docker compose logs --tail=20 api
docker compose exec redis redis-cli GET link:RETURNED_CODE
docker compose exec redis redis-cli TTL link:RETURNED_CODE
```

Then stop Redis, repeat the redirect, and restart it. The redirect should
still return `302` with the same destination:

```sh
docker compose stop redis
curl -i http://localhost:3000/r/RETURNED_CODE
docker compose start redis
```
