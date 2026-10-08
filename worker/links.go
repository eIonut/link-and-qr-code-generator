package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type Link struct {
	ID       string `bson:"_id"`
	ShortURL string `bson:"shortUrl"`
	QR       struct {
		Status  string `bson:"status"`
		Version int    `bson:"version"`
	} `bson:"qr"`
}

type MongoLinks struct {
	collection *mongo.Collection
}

func (m *MongoLinks) Find(ctx context.Context, id string) (*Link, error) {
	var link Link
	err := m.collection.FindOne(ctx, bson.M{"_id": id}).Decode(&link)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	return &link, err
}

func (m *MongoLinks) SetQR(ctx context.Context, id string, version int, status, key, code string) error {
	result, err := m.collection.UpdateOne(ctx,
		bson.M{"_id": id, "qr.version": version},
		bson.M{"$set": bson.M{
			"qr.status": status, "qr.objectKey": nullable(key), "qr.errorCode": nullable(code),
			"qr.updatedAt": time.Now().UTC(),
		}})
	if err != nil {
		return err
	}
	if result.MatchedCount == 0 {
		return fmt.Errorf("link %s or QR version %d no longer exists", id, version)
	}
	return nil
}

func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
