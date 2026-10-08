package main

import (
	"bytes"
	"context"
	"errors"
	"image/png"
	"testing"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
)

type qrUpdate struct{ status, key, code string }
type fakeLinks struct {
	link    *Link
	updates []qrUpdate
	failOn  string
}

func (f *fakeLinks) Find(context.Context, string) (*Link, error) { return f.link, nil }
func (f *fakeLinks) SetQR(_ context.Context, _ string, _ int, status, key, code string) error {
	f.updates = append(f.updates, qrUpdate{status, key, code})
	if status == f.failOn {
		return errors.New("MongoDB unavailable")
	}
	return nil
}

type fakeImages struct {
	key string
	png []byte
	err error
}

func (f *fakeImages) Upload(_ context.Context, key string, png []byte) error {
	f.key, f.png = key, png
	return f.err
}

func fixture() (*fakeLinks, *fakeImages, LinkCreated) {
	link := &Link{ID: "link-id", ShortURL: "http://localhost:3000/r/0df74b31-4265-46ec-addc-342695594706"}
	link.QR.Status, link.QR.Version = "pending", 1
	event := LinkCreated{EventID: "event-id", EventType: "LinkCreated", SchemaVersion: 1}
	event.Payload.LinkID, event.Payload.QRVersion = link.ID, 1
	event.Payload.ShortURL = "https://event.example/ignored"
	return &fakeLinks{link: link}, &fakeImages{}, event
}

func TestProcessorGeneratesDecodableQRAndMarksReady(t *testing.T) {
	links, images, event := fixture()
	processor := Processor{Links: links, Images: images}
	if err := processor.Process(context.Background(), event); err != nil {
		t.Fatal(err)
	}
	if len(links.updates) != 2 || links.updates[0].status != "processing" || links.updates[1] != (qrUpdate{"ready", "qr/link-id/v1.png", ""}) {
		t.Fatalf("unexpected QR updates: %+v", links.updates)
	}
	image, err := png.Decode(bytes.NewReader(images.png))
	if err != nil {
		t.Fatal(err)
	}
	if image.Bounds().Dx() != 512 || image.Bounds().Dy() != 512 {
		t.Fatal("expected a 512px PNG")
	}
	bitmap, err := gozxing.NewBinaryBitmapFromImage(image)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := qrcode.NewQRCodeReader().Decode(bitmap, nil)
	if err != nil || decoded.GetText() != links.link.ShortURL {
		t.Fatalf("QR must encode the saved URL: result=%v error=%v", decoded, err)
	}
}

func TestProcessorSkipsMissingReadyAndStaleLinks(t *testing.T) {
	for _, scenario := range []string{"missing", "ready", "stale"} {
		t.Run(scenario, func(t *testing.T) {
			links, images, event := fixture()
			switch scenario {
			case "missing":
				links.link = nil
			case "ready":
				links.link.QR.Status = "ready"
			case "stale":
				event.Payload.QRVersion = 2
			}
			if err := (&Processor{links, images}).Process(context.Background(), event); err != nil {
				t.Fatal(err)
			}
			if len(links.updates) != 0 || images.png != nil {
				t.Fatal("skipped events must not update MongoDB or upload")
			}
		})
	}
}

func TestUploadFailureIsRecorded(t *testing.T) {
	links, images, event := fixture()
	images.err = errors.New("R2 unavailable")
	if err := (&Processor{links, images}).Process(context.Background(), event); err != nil {
		t.Fatal(err)
	}
	if links.updates[1] != (qrUpdate{"failed", "", "QR_UPLOAD_FAILED"}) {
		t.Fatalf("unexpected failure state: %+v", links.updates)
	}
}

func TestDatabaseFailureAfterUploadStopsProcessing(t *testing.T) {
	links, images, event := fixture()
	links.failOn = "ready"
	if err := (&Processor{links, images}).Process(context.Background(), event); err == nil {
		t.Fatal("a failed ready-state write must prevent offset commit")
	}
}

func TestDecodeEventRejectsMalformedAndUnsupportedEvents(t *testing.T) {
	for _, value := range []string{"not JSON", `{}`, `{"eventType":"LinkCreated","schemaVersion":2}`} {
		if _, err := decodeEvent([]byte(value)); err == nil {
			t.Fatal("expected invalid event to be rejected")
		}
	}
}
