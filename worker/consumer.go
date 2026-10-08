package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"golang.org/x/sync/errgroup"
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
		fetches := client.PollRecords(ctx, 3)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		for _, fetchErr := range fetches.Errors() {
			log.Printf("Kafka fetch error: %v", fetchErr)
		}
		if err := processBatch(ctx, fetches.Records(), process, client.CommitRecords); err != nil {
			return err
		}
		client.AllowRebalance()
	}
}

func processBatch(ctx context.Context, records []*kgo.Record, process func(context.Context, LinkCreated) error, commit func(context.Context, ...*kgo.Record) error) error {
	if len(records) == 0 {
		return nil
	}
	// This consumer subscribes to one topic. Preserve order within each partition.
	partitions := make(map[int32][]*kgo.Record)
	for _, record := range records {
		partitions[record.Partition] = append(partitions[record.Partition], record)
	}
	var jobs errgroup.Group
	for _, partitionRecords := range partitions {
		jobs.Go(func() error {
			for _, record := range partitionRecords {
				event, err := decodeEvent(record.Value)
				if err != nil {
					log.Printf("Skipping invalid event: partition=%d offset=%d error=%v", record.Partition, record.Offset, err)
					continue
				}
				log.Printf("Processing QR: partition=%d offset=%d event=%s", record.Partition, record.Offset, event.EventID)
				jobCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
				err = process(jobCtx, event)
				cancel()
				if err != nil {
					return fmt.Errorf("process event %s: %w", event.EventID, err)
				}
			}
			return nil
		})
	}
	// Wait for all goroutines before committing or letting Kafka reassign partitions.
	if err := jobs.Wait(); err != nil {
		return err
	}
	commitCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := commit(commitCtx, records...); err != nil {
		return fmt.Errorf("commit offsets: %w", err)
	}
	return nil
}
