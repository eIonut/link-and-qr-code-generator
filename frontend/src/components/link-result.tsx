import { useEffect, useState, type Ref } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, Download, LoaderCircle, QrCode } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { downloadQr, getLink, type Link } from "../lib/links";

const isQrPending = (link: Link) => ["pending", "processing"].includes(link.qr.status);

export function LinkResult({ initialLink, headingRef }: { initialLink: Link; headingRef: Ref<HTMLHeadingElement> }) {
  const [pollingExpired, setPollingExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const query = useQuery({
    queryKey: ["link", initialLink.id],
    queryFn: ({ signal }) => getLink(initialLink.id, signal),
    initialData: initialLink,
    enabled: (query) => !pollingExpired && !!query.state.data && isQrPending(query.state.data),
    refetchInterval: (query) => !pollingExpired && !!query.state.data && isQrPending(query.state.data) ? 2_000 : false,
    retry: false,
  });
  const link = query.data;
  const pending = isQrPending(link);
  const download = useMutation({ mutationFn: () => downloadQr(link), retry: false });

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => setPollingExpired(true), 120_000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyLink() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied(true);
    } catch {
      setCopyError("Could not copy automatically. Select and copy the short URL above.");
    }
  }

  return (
    <Card className="py-6 shadow-none sm:py-8">
      <CardContent className="grid gap-8 px-6 sm:grid-cols-[1fr_220px] sm:px-8">
        <div className="min-w-0 space-y-5">
          <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 font-medium text-primary outline-none">
            <CheckCircle2 className="size-5" aria-hidden="true" /> Your link is ready
          </h2>
          <div className="space-y-2">
            {link.title && <p className="text-sm font-medium">{link.title}</p>}
            <a href={link.shortUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-2xl font-semibold tracking-tight underline-offset-4 hover:underline sm:text-3xl">
              {link.shortUrl}
            </a>
            <p className="text-xs text-muted-foreground">Original URL</p>
            <p className="break-all text-sm text-muted-foreground">{link.destinationUrl}</p>
          </div>
          <Button variant="outline" onClick={copyLink} className="h-10 gap-2 px-4">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <p role="status" className="text-sm text-muted-foreground">
            {copied ? "Link copied to clipboard." : "The QR code opens this short link."}
          </p>
          {copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}
        </div>

        <div className="flex flex-col items-center gap-3 border-t pt-6 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <QrPreview key={link.qr.imageUrl} link={link} />
          <p role="status" className="text-center text-xs text-muted-foreground">
            {link.qr.status === "ready" ? "QR code ready to share" :
              link.qr.status === "failed" ? "QR generation failed." :
                pollingExpired ? "QR is taking longer than expected." : "Generating your QR code…"}
          </p>
          <Button variant="outline" className="h-10 w-full gap-2 px-4" disabled={link.qr.status !== "ready" || download.isPending} onClick={() => download.mutate()}>
            {download.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            {download.isPending ? "Downloading…" : "Download QR"}
          </Button>
          {pending && (pollingExpired || query.isError) && (
            <Button variant="ghost" disabled={query.isFetching} onClick={() => query.refetch()}>
              {query.isFetching ? "Checking…" : "Check QR status"}
            </Button>
          )}
          {query.isError && <p role="alert" className="text-center text-xs text-destructive">Could not check QR status. {query.error.message}</p>}
          {download.isError && <p role="alert" className="text-center text-xs text-destructive">{download.error.message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function QrPreview({ link }: { link: Link }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className="flex size-44 items-center justify-center rounded-xl border bg-white p-3">
      {link.qr.status === "ready" && link.qr.imageUrl && !imageFailed ? (
        <img src={link.qr.imageUrl} alt={`QR code for ${link.title || link.shortUrl}`} className="size-full object-contain" onError={() => setImageFailed(true)} />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
          {isQrPending(link) ? <LoaderCircle className="size-8 animate-spin" aria-hidden="true" /> : <QrCode className="size-8" aria-hidden="true" />}
          <span className="text-xs">
            {isQrPending(link) ? "Preparing QR code" : link.qr.status === "failed" ? "QR unavailable" : "Preview unavailable"}
          </span>
        </div>
      )}
    </div>
  );
}
