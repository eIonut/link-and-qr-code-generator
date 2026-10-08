package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx); err != nil && ctx.Err() == nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	cfg, err := readConfig()
	if err != nil {
		return err
	}
	client, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURI).SetTimeout(5 * time.Second))
	if err != nil {
		return err
	}
	defer client.Disconnect(context.Background())
	if err := client.Ping(ctx, nil); err != nil {
		return err
	}
	processor := Processor{
		Links:  &MongoLinks{collection: client.Database(cfg.Database).Collection("links")},
		Images: newR2Storage(cfg),
	}
	return consume(ctx, cfg, processor.Process)
}
