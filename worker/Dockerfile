# syntax=docker/dockerfile:1
FROM golang:1.26.8-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /qr-worker .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /qr-worker /usr/local/bin/qr-worker
USER 10001:10001
CMD ["qr-worker"]
