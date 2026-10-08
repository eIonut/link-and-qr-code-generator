package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

func kafkaRecord(t *testing.T, partition int32, offset int64) *kgo.Record {
	t.Helper()
	_, _, event := fixture()
	event.EventID = fmt.Sprintf("%d:%d", partition, offset)
	event.Payload.LinkID = event.EventID
	value, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	return &kgo.Record{Topic: linkCreatedTopic, Partition: partition, Offset: offset, Value: value}
}

func TestBatchRunsPartitionsConcurrentlyInOrderAndCommitsAfterCompletion(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	records := []*kgo.Record{kafkaRecord(t, 0, 0), kafkaRecord(t, 0, 1), kafkaRecord(t, 1, 0), kafkaRecord(t, 2, 0)}
	started := make(chan string, len(records))
	release := make(chan struct{})
	var completed atomic.Int32
	committed := make(chan int, 1)
	done := make(chan error, 1)
	go func() {
		done <- processBatch(ctx, records, func(ctx context.Context, event LinkCreated) error {
			started <- event.EventID
			select {
			case <-release:
				completed.Add(1)
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}, func(_ context.Context, records ...*kgo.Record) error {
			if completed.Load() != 4 {
				return errors.New("committed before all jobs completed")
			}
			committed <- len(records)
			return nil
		})
	}()
	// All three partitions must start while their first jobs are still blocked.
	want := map[string]bool{"0:0": true, "1:0": true, "2:0": true}
	for range 3 {
		select {
		case id := <-started:
			if !want[id] {
				t.Fatalf("partition advanced before its first job completed: %s", id)
			}
			delete(want, id)
		case <-ctx.Done():
			t.Fatal("partitions did not run concurrently")
		}
	}
	close(release)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("batch did not finish")
	}
	if id := <-started; id != "0:1" {
		t.Fatalf("unexpected last job: %s", id)
	}
	if count := <-committed; count != len(records) {
		t.Fatalf("committed %d records, want %d", count, len(records))
	}
}

func TestBatchFailureWaitsForOtherPartitionsAndDoesNotCommit(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	records := []*kgo.Record{kafkaRecord(t, 0, 0), kafkaRecord(t, 0, 1), kafkaRecord(t, 1, 0)}
	failure := errors.New("MongoDB unavailable")
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan error, 1)
	committed, advanced := false, false
	go func() {
		done <- processBatch(ctx, records, func(ctx context.Context, event LinkCreated) error {
			if event.EventID == "0:0" {
				return failure
			}
			if event.EventID == "0:1" {
				advanced = true
				return nil
			}
			close(started)
			select {
			case <-release:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}, func(context.Context, ...*kgo.Record) error {
			committed = true
			return nil
		})
	}()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("other partition did not start")
	}
	select {
	case <-done:
		t.Fatal("batch returned while a partition was still running")
	default:
	}
	close(release)
	select {
	case err := <-done:
		if !errors.Is(err, failure) {
			t.Fatalf("expected processing failure, got %v", err)
		}
	case <-ctx.Done():
		t.Fatal("batch did not finish")
	}
	if committed || advanced {
		t.Fatal("failed batch must not commit or advance the failed partition")
	}
}

func TestBatchSkipsMalformedEventAndPropagatesCommitFailure(t *testing.T) {
	records := []*kgo.Record{kafkaRecord(t, 0, 0), kafkaRecord(t, 0, 1)}
	records[0].Value = []byte("invalid JSON")
	failure := errors.New("Kafka unavailable")
	processed := 0
	err := processBatch(context.Background(), records, func(context.Context, LinkCreated) error {
		processed++
		return nil
	}, func(_ context.Context, batch ...*kgo.Record) error {
		if len(batch) != 2 || batch[1].Offset != 1 {
			t.Error("commit must include the skipped record and the following job")
		}
		return failure
	})
	if processed != 1 || !errors.Is(err, failure) {
		t.Fatalf("processed=%d error=%v", processed, err)
	}
}
