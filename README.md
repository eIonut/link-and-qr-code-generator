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
