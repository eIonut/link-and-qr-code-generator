# link-and-qr-code-generator

Run the frontend, API, MongoDB, and Redis with Docker Compose:

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

The API connects to MongoDB using Mongoose before starting its HTTP server. Local development
defaults to `mongodb://127.0.0.1:27017/qr_code_generator`; set `MONGODB_URI` to
override it. Compose supplies the connection URL for the MongoDB service.

The frontend includes a shadcn/Tailwind URL form, optional title, short-link
result, copy control, QR preview, and PNG download control. It expects the
`POST /api/links`, `GET /api/links/:id`, and
`GET /api/links/:id/qr/download` contracts in
[the requirements](design/LINK_SHORTENER_REQUIREMENTS.md). Those API routes
and the QR worker are not implemented yet; the form reports service errors
until they are available. Downloads are enabled only when the API reports
the QR as ready. Pending QR status is polled every two seconds for up to
two minutes, with a manual status check afterward.

For frontend development, run `pnpm install` and `pnpm dev` in `frontend`.
Vite proxies `/api` to `http://localhost:3000`; the Docker frontend proxies
it to `api:3000`. To use a separate API origin, copy `frontend/.env.example`
to `frontend/.env` and set `VITE_API_BASE_URL` before building. The separate
API must allow the frontend origin through CORS.
