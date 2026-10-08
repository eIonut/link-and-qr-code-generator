import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, Download, LoaderCircle, QrCode } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { downloadQr, getLink, type Link } from "../lib/links";

export function LinkResult({ initialLink }: { initialLink: Link }) {
  const query = useQuery({
    queryKey: ["link", initialLink.id],
    queryFn: ({ signal }) => getLink(initialLink.id, signal),
    initialData: initialLink,
    refetchInterval: (query) => !query.state.error && ["pending", "processing"].includes(query.state.data?.qr.status ?? "") ? 2_000 : false,
    retry: false,
  });
  const link = query.data;
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(link.shortUrl) });
  const download = useMutation({ mutationFn: () => downloadQr(link) });
  const error = query.error ?? copy.error ?? download.error;
  const qrMessage = {
    pending: "Waiting for the QR worker…",
    processing: "Generating your QR code…",
    ready: "QR code ready to share",
    failed: "QR generation failed.",
  }[link.qr.status];

  return (
    <Card className="py-6 shadow-none sm:py-8">
      <CardContent className="grid gap-8 px-6 sm:grid-cols-[1fr_220px] sm:px-8">
        <div className="min-w-0 space-y-5">
          <h2 className="flex items-center gap-2 font-medium text-primary">
            <CheckCircle2 className="size-5" aria-hidden="true" /> Your link is ready
          </h2>
          <div className="space-y-2">
            {link.title && <p className="text-sm font-medium">{link.title}</p>}
            <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-2xl font-semibold tracking-tight underline-offset-4 hover:underline">
              {link.shortUrl}
            </a>
            <p className="text-xs text-muted-foreground">Original URL</p>
            <p className="break-all text-sm text-muted-foreground">{link.destinationUrl}</p>
          </div>
          <Button variant="outline" onClick={() => copy.mutate()} disabled={copy.isPending} className="h-10 gap-2 px-4">
            {copy.isSuccess ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copy.isSuccess ? "Copied!" : "Copy link"}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {copy.isSuccess ? "Link copied to clipboard." : "The QR code opens this link."}
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
        </div>

        <div className="flex flex-col items-center gap-3 border-t pt-6 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div className="flex size-44 items-center justify-center rounded-xl border bg-white p-3">
            {link.qr.status === "ready" && link.qr.imageUrl ? (
              <img src={link.qr.imageUrl} alt={`QR code for ${link.title || link.shortUrl}`} className="size-full object-contain" />
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
