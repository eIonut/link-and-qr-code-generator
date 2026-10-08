import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Download, LoaderCircle, QrCode } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { downloadQr, type Link } from "../lib/links";

export function LinkResult({ link }: { link: Link }) {
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(link.shortUrl) });
  const download = useMutation({ mutationFn: () => downloadQr(link) });
  const error = copy.error ?? download.error;
  const qrMessage = {
    pending: "Waiting for the QR worker…",
    processing: "Generating your QR code…",
    ready: "QR code ready to share",
    failed: "QR generation failed.",
  }[link.qr.status];

  return (
    <Card className="py-5 shadow-none">
      <CardContent className="grid gap-6 px-6 sm:grid-cols-[1fr_180px]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h3 className="break-words font-semibold">{link.title || "Untitled link"}</h3>
            <p className="text-xs text-muted-foreground">Created {new Date(link.createdAt).toLocaleString()}</p>
          </div>
          <div className="space-y-2">
            <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-base font-medium text-primary underline-offset-4 hover:underline">
              {link.shortUrl}
            </a>
            <p className="text-xs text-muted-foreground">Original URL</p>
            <p className="break-all text-sm text-muted-foreground">{link.destinationUrl}</p>
          </div>
          <Button variant="outline" onClick={() => copy.mutate()} disabled={copy.isPending} className="h-10 gap-2 px-4">
            {copy.isSuccess ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copy.isSuccess ? "Copied!" : "Copy link"}
          </Button>
          {copy.isSuccess && <p role="status" className="text-xs text-muted-foreground">Link copied to clipboard.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        </div>

        <div className="flex flex-col items-center gap-3 border-t pt-6 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div className="flex size-28 items-center justify-center rounded-xl border bg-white p-2">
            {link.qr.status === "ready" && link.qr.imageUrl ? (
              <img src={link.qr.imageUrl} alt={`QR code for ${link.title || link.shortUrl}`} loading="lazy" className="size-full object-contain" />
            ) : ["pending", "processing"].includes(link.qr.status) ? (
              <LoaderCircle className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <QrCode className="size-8 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <p role="status" className="text-center text-xs text-muted-foreground">{qrMessage}</p>
          <Button variant="outline" className="h-10 w-full gap-2 px-4" disabled={link.qr.status !== "ready" || download.isPending} onClick={() => download.mutate()}>
            <Download aria-hidden="true" />
            {download.isPending ? "Downloading…" : "Download QR"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
