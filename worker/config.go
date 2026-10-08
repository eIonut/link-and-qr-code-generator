package main

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Brokers     []string
	Group       string
	MongoURI    string
	Database    string
	R2Endpoint  string
	R2AccessKey string
	R2SecretKey string
	R2Bucket    string
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func readConfig() (Config, error) {
	for _, name := range []string{"R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"} {
		if env(name, "") == "" {
			return Config{}, fmt.Errorf("%s is required", name)
		}
	}
	brokers := strings.Split(env("KAFKA_BROKERS", "localhost:9092"), ",")
	for i := range brokers {
		brokers[i] = strings.TrimSpace(brokers[i])
	}
	return Config{
		Brokers: brokers, Group: env("KAFKA_QR_GROUP_ID", "qr-workers-v1"),
		MongoURI:   env("MONGODB_URI", "mongodb://127.0.0.1:27017/qr_code_generator"),
		Database:   env("LINKS_DB_NAME", "qr_code_generator"),
		R2Endpoint: env("R2_ENDPOINT", ""), R2AccessKey: env("R2_ACCESS_KEY_ID", ""),
		R2SecretKey: env("R2_SECRET_ACCESS_KEY", ""), R2Bucket: env("R2_BUCKET_NAME", ""),
	}, nil
}
