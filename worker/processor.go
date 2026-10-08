package main

import (
	"context"
	"fmt"
	"log"

	"github.com/skip2/go-qrcode"
)

type LinkStore interface {
	Find(context.Context, string) (*Link, error)
	SetQR(context.Context, string, int, string, string, string) error
}

type ImageStore interface {
	Upload(context.Context, string, []byte) error
}

type Processor struct {
	Links  LinkStore
	Images ImageStore
}

func (p *Processor) Process(ctx context.Context, event LinkCreated) error {
	link, err := p.Links.Find(ctx, event.Payload.LinkID)
	if err != nil {
		return err
	}
	if link == nil {
		log.Printf("Skipping missing link %s", event.Payload.LinkID)
		return nil
	}
	if link.QR.Version != event.Payload.QRVersion || link.QR.Status == "ready" {
		log.Printf("Skipping completed or stale QR event %s", event.EventID)
		return nil
	}
	if err := p.Links.SetQR(ctx, link.ID, link.QR.Version, "processing", "", ""); err != nil {
		return err
	}
	// MongoDB owns the saved URL; event payloads do not override it.
	png, err := qrcode.Encode(link.ShortURL, qrcode.Medium, 512)
	if err != nil {
		return p.fail(ctx, link, "QR_GENERATION_FAILED", err)
	}
	key := fmt.Sprintf("qr/%s/v%d.png", link.ID, link.QR.Version)
	if err := p.Images.Upload(ctx, key, png); err != nil {
		return p.fail(ctx, link, "QR_UPLOAD_FAILED", err)
	}
	if err := p.Links.SetQR(ctx, link.ID, link.QR.Version, "ready", key, ""); err != nil {
		return err
	}
	log.Printf("QR ready: link=%s object=%s", link.ID, key)
	return nil
}

func (p *Processor) fail(ctx context.Context, link *Link, code string, cause error) error {
	log.Printf("QR failed: link=%s error=%v", link.ID, cause)
	return p.Links.SetQR(ctx, link.ID, link.QR.Version, "failed", "", code)
}
