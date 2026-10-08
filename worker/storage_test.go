package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStorageUsesSignedS3PutWithPNGMetadata(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.Method != "PUT" || r.URL.Path != "/qr-test/qr/link-id/v1.png" || string(body) != "png bytes" {
			t.Errorf("unexpected upload: %s %s %q", r.Method, r.URL.Path, body)
		}
		if r.Header.Get("Content-Type") != "image/png" || !strings.Contains(r.Header.Get("Cache-Control"), "immutable") {
			t.Error("missing PNG cache metadata")
		}
		if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256") {
			t.Error("expected an S3 signed request")
		}
		if r.Header.Get("X-Amz-Sdk-Checksum-Algorithm") != "" {
			t.Error("optional AWS checksum algorithms must not be sent to R2")
		}
		w.Header().Set("ETag", `"test"`)
	}))
	defer server.Close()
	storage := newR2Storage(Config{R2Endpoint: server.URL, R2Bucket: "qr-test", R2AccessKey: "test", R2SecretKey: "test"})
	if err := storage.Upload(context.Background(), "qr/link-id/v1.png", []byte("png bytes")); err != nil {
		t.Fatal(err)
	}
}
