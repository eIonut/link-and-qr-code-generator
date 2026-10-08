package main

import (
	"bytes"
	"context"
	"net/http"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Storage struct {
	client *s3.Client
	bucket string
}

func newR2Storage(cfg Config) *R2Storage {
	client := s3.NewFromConfig(aws.Config{
		Region: "auto", Credentials: credentials.NewStaticCredentialsProvider(cfg.R2AccessKey, cfg.R2SecretKey, ""),
		HTTPClient: &http.Client{Timeout: 15 * time.Second}, RetryMaxAttempts: 2,
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	}, func(options *s3.Options) {
		options.BaseEndpoint = aws.String(cfg.R2Endpoint)
		options.UsePathStyle = true
	})
	return &R2Storage{client: client, bucket: cfg.R2Bucket}
}

func (r *R2Storage) Upload(ctx context.Context, key string, png []byte) error {
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(r.bucket), Key: aws.String(key), Body: bytes.NewReader(png),
		ContentType: aws.String("image/png"), CacheControl: aws.String("public, max-age=31536000, immutable"),
	})
	return err
}
