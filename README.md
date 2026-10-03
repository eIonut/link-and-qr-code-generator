# link-and-qr-code-generator

Run the production frontend with Docker Compose:

```sh
docker compose up --build -d frontend
```

Open http://localhost:8080. The multi-stage image builds with Node.js and pnpm,
then serves only the compiled static files using unprivileged Nginx.
