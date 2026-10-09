# Link and QR generator

A local POC for learning Redis, Kafka, Cloudflare R2, and Go workers.
Keep the implementation focused on the happy path and basic errors.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every push
to any branch, including updates to PR branches and `main`. Three independent
jobs run in parallel: build and test the API; build the frontend; and build,
test, and vet the Go worker. Tests use mocks and local test servers, so no
running services or R2 credentials are needed. View results in the repository's
**Actions** tab.

An optional final job posts all three results and a link to the run to Slack,
including when a build or test fails. To enable it:

1. [Create a Slack app](https://api.slack.com/apps) from scratch in your workspace.
2. Open **Incoming Webhooks** and activate them.
3. Click **Add New Webhook to Workspace**, choose a channel, and authorize it.
4. Copy its webhook URL into a GitHub repository secret named
   `SLACK_WEBHOOK_URL` under **Settings → Secrets and variables → Actions →
   New repository secret**.
5. Push a commit to run the pipeline and receive a message.

The message step is skipped until the secret exists. Keep the webhook URL in
GitHub Secrets; it is a credential and does not belong in the repository or
the app's `.env`. The job uses the
[official Slack action with an incoming webhook](https://docs.slack.dev/tools/slack-github-action/sending-data-slack-incoming-webhook/).

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

To inspect Redis and Kafka in your browser, start the optional dashboards:

```sh
docker compose --profile tools up -d redis-ui kafka-ui
```

- [Redis Commander](http://localhost:8082): expand `local`, then `link`, and
  select a cached key to see its `{ id, destinationUrl }` value and remaining
  TTL. Refresh the tree to see new keys. Only opening a short URL populates
  this cache; generating a link alone does not.
- [Kafbat UI](http://localhost:8081): open **Topics → links.created.v1 →
  Messages** to inspect `LinkCreated` events. Open **Consumers →
  qr-workers-v1** to see partition offsets and lag. Lag zero means the worker
  has consumed all available events. Consumed messages remain visible until
  Kafka's retention removes them.

Both dashboards connect automatically, bind to localhost, and run in
read-only mode. They query the current services when you refresh. To watch
the flow, generate a link, inspect its Kafka event, open its short URL, and
refresh Redis to see the new cached destination.

The configuration follows the [Redis Commander Docker setup](https://github.com/joeferner/redis-commander#with-docker-compose)
and [Kafbat configuration guide](https://ui.docs.kafbat.io/configuration/configuration-file).
Redis Commander's multi-platform image is pinned by digest; Kafbat is pinned
to version 1.5.0. Stop the dashboards without stopping the app with
`docker compose --profile tools stop redis-ui kafka-ui`.

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
Client setup lives in `api/config/kafka.ts`. One producer stays connected for
the API's lifetime and disconnects after active requests finish on shutdown.

After MongoDB saves a new link, the API publishes `LinkCreated` to
`links.created.v1`, keyed by the link ID. It waits for the broker acknowledgment
before returning `201`, using [KafkaJS's producer](https://kafka.js.org/docs/producing).
The JSON event has this shape:

```json
{
  "eventId": "LINK_UUID",
  "eventType": "LinkCreated",
  "schemaVersion": 1,
  "occurredAt": "2026-10-08T12:00:00.000Z",
  "payload": {
    "linkId": "LINK_UUID",
    "shortUrl": "http://localhost:3000/r/LINK_UUID",
    "qrVersion": 1
  }
}
```

Each link has one creation event. Its event ID reuses the link UUID and its
timestamp uses the stored creation time, so republishing keeps the same event
identity. Destination URLs and titles are not included in the event. Event
types live in `api/models/`; publishing lives in `api/services/`.

If publishing fails after saving, the API still returns `201` with the saved
link, QR status `pending`, and `warning.code = "LINK_CREATED_PUBLISH_FAILED"`.
The frontend shows its warning message. Producer retries and timeouts are
bounded; MongoDB and Kafka writes are separate, so delivery is not atomic.
Use the link ID from the response to republish after Kafka recovers:

```sh
# From api/ with MongoDB and Kafka running:
pnpm kafka:republish LINK_ID
# Or from the repository root with Compose:
docker compose exec api node dist/scripts/republish-link-created.js LINK_ID
```

To inspect application events, run this in one terminal and create a link
through the frontend or API in another:

```sh
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:29092 --topic links.created.v1 --from-beginning \
  --property print.key=true
```

The Go worker consumes `links.created.v1` with `franz-go@v1.22.1`, generates a
512 × 512 PNG containing the saved short URL, uploads it to R2 at
`qr/{linkId}/v1.png`, and updates only the link's QR fields in MongoDB.
It runs independently of the API. One instance fetches at most three events
per batch and processes different partitions concurrently using goroutines.
Events from the same partition run sequentially. With three partitions,
one instance can process up to three QRs at once when jobs are available
across all three; a batch containing only one partition stays sequential.

To enable QR generation, copy the root `.env.example` to `.env` and fill in
the five R2 variables. Create an R2 bucket and bucket-scoped Object Read &
Write credentials. Set `R2_ENDPOINT` to your account's S3 endpoint and
`R2_PUBLIC_BASE_URL` to the bucket's enabled `r2.dev` URL or custom domain,
without a bucket-name suffix. Credentials stay on the API and worker.
The S3 endpoint must also exclude the bucket name: use
`https://ACCOUNT_ID.r2.cloudflarestorage.com`, without `/qr-codes`.
See [Cloudflare's S3 setup](https://developers.cloudflare.com/r2/api/tokens/)
and [public bucket setup](https://developers.cloudflare.com/r2/buckets/public-buckets/).

```sh
cp .env.example .env
# Fill in .env, then start the API and worker with the shared R2 settings:
docker compose --profile qr up --build -d
docker compose logs -f qr-worker
```

The `qr` profile keeps the worker optional until R2 is configured. Without it,
links and redirects still work and QR jobs remain pending. The API returns
the public R2 image URL once the QR is ready; the existing UI polls for this
state and enables Download QR. `GET /api/links/:id/qr/download` reads the PNG
through R2's S3 API and returns an attachment. Preview requests go directly
to the public bucket. CDN caching remains a separate custom-domain exercise.

Kafka offsets are committed after the whole batch finishes and MongoDB
records the ready or failed states. The worker waits for all batch goroutines
before committing or allowing Kafka to reassign its partitions. If any job
returns an error, the batch is left uncommitted and the worker restarts;
already-ready QRs are skipped on replay. This batch barrier keeps offset
handling simple, though a slow job delays the next batch.
Missing links, stale versions, and already-ready versions are skipped;
duplicates therefore do not upload a second asset. Invalid events are logged
and skipped. Generation/upload errors mark the QR failed; use the existing
republish command above after fixing the cause. Database or offset-commit
errors stop the worker without committing that event; Compose restarts it.
There is no custom retry queue or dead-letter service.

For host development, use Go 1.26 or newer and export the root `.env` values
before running the worker. When using a different MongoDB database, set
`LINKS_DB_NAME` to match the API's database. The default group is
`qr-workers-v1`; override it with `KAFKA_QR_GROUP_ID`.

```sh
set -a
source .env
set +a
cd worker
go run .
# Verification:
go test ./...
go vet ./...
```

The worker stays in one Go package, split into configuration, event decoding,
Kafka consumption, QR processing, MongoDB updates, and R2 storage files.
Its processor depends on two small storage interfaces. Tests decode the
generated PNG and verify failure handling, duplicate skipping, and signed
S3 upload requests without cloud credentials. The Docker build pins Go 1.26.8.

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

The frontend includes a shadcn/Tailwind URL form, optional title, and a list
of all saved links, newest first, with copy, QR preview, and PNG download
controls. The list loads from MongoDB on page load, refreshes after creation,
and polls every two seconds while any QR is pending or processing. It uses
one list request rather than a separate polling request per link.
The API implements `POST /api/links`, `GET /api/links`, `GET /api/links/:id`,
and `GET /r/:shortCode` from
[the requirements](design/LINK_SHORTENER_REQUIREMENTS.md). Links persist in
MongoDB with one full UUID for both the link ID and public URL code.
Creation validates HTTP/HTTPS URLs and an optional title. Existing
seven-character links still work. Redirects return `302` with `Cache-Control: no-store`.

Created links report QR status `pending` until the worker processes them.
The saved-links list keeps polling until all QRs are ready or failed.
Downloads return `409` before readiness and `404` for a missing link.

For frontend development, run `pnpm install` and `pnpm dev` in `frontend`.
Vite proxies `/api` to `http://localhost:3000`; the Docker frontend proxies
it to `api:3000`. To use a separate API origin, copy `frontend/.env.example`
to `frontend/.env` and set `VITE_API_BASE_URL` before building. The separate
API must allow the frontend origin through CORS.

For API development, run `pnpm install` and `pnpm dev` in `api`, with MongoDB
and Kafka running. Copy `api/.env.example` to `api/.env` to override the port,
database, `REDIS_URL`, `KAFKA_BROKERS`, or `SHORT_BASE_URL`. The API also reads
the shared R2 variables from the root `.env`. The short base URL includes `/r` and is saved with each
new link. For phone access, use a reachable LAN address or deployed domain
before creating links. Compose accepts a `SHORT_BASE_URL` environment override
too. Run `pnpm test` for API behavior tests and `pnpm build` for a typechecked
production build.

API code stays split into `models/`, `routes/`, `controllers/`, `services/`,
`schemas/`, `config/`, `middleware/`, and `tests/`. `app.ts` wires these together.

The learning path keeps Redis redirect caching, Kafka events, a Go QR worker
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
