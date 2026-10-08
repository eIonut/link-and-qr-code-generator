package main

import (
	"encoding/json"
	"fmt"
)

const linkCreatedTopic = "links.created.v1"

type LinkCreated struct {
	EventID       string `json:"eventId"`
	EventType     string `json:"eventType"`
	SchemaVersion int    `json:"schemaVersion"`
	Payload       struct {
		LinkID    string `json:"linkId"`
		ShortURL  string `json:"shortUrl"`
		QRVersion int    `json:"qrVersion"`
	} `json:"payload"`
}

func decodeEvent(data []byte) (LinkCreated, error) {
	var event LinkCreated
	if err := json.Unmarshal(data, &event); err != nil {
		return event, err
	}
	if event.EventType != "LinkCreated" || event.SchemaVersion != 1 || event.EventID == "" || event.Payload.LinkID == "" || event.Payload.QRVersion < 1 {
		return event, fmt.Errorf("invalid LinkCreated event")
	}
	return event, nil
}
