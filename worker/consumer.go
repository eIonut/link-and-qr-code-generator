package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

func consume(ctx context.Context, cfg Config, process func(context.Context, LinkCreated) error) error {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(cfg.Brokers...), kgo.ConsumerGroup(cfg.Group),
		kgo.ConsumeTopics(linkCreatedTopic), kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
		kgo.DisableAutoCommit(), kgo.BlockRebalanceOnPoll(),
	)
	if err != nil {
		return err
	}
	defer client.CloseAllowingRebalance()
	log.Printf("QR worker consuming %s with group %s", linkCreatedTopic, cfg.Group)
	for {
		fetches := client.PollRecords(ctx, 1)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		for _, fetchErr := range fetches.Errors() {
			log.Printf("Kafka fetch error: %v", fetchErr)
		}
		for _, record := range fetches.Records() {
			jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			event, decodeErr := decodeEvent(record.Value)
			if decodeErr != nil {
				// Log and skip malformed input so one record cannot block the POC.
				log.Printf("Skipping invalid event: partition=%d offset=%d error=%v", record.Partition, record.Offset, decodeErr)
			} else if err := process(jobCtx, event); err != nil {
				cancel()
				return fmt.Errorf("process event %s: %w", event.EventID, err)
			}
			err := client.CommitRecords(jobCtx, record)
			cancel()
			if err != nil {
				return fmt.Errorf("commit offset: %w", err)
			}
		}
		client.AllowRebalance()
	}
}
