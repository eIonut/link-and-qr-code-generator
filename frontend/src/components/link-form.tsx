import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Download, Link2, QrCode } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { createLink } from "../lib/links";
import { LinkResult } from "./link-result";

export function LinkForm() {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [title, setTitle] = useState("");
  const [urlError, setUrlError] = useState("");
  const urlInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const creation = useMutation({ mutationFn: createLink, retry: false });

  useEffect(() => {
    if (creation.isSuccess) resultHeading.current?.focus();
  }, [creation.isSuccess]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creation.isPending) return;
    const destination = destinationUrl.trim();
    let error = "";
    try {
      const url = new URL(destination);
      if (!["http:", "https:"].includes(url.protocol) || !/^https?:\/\//i.test(destination)) {
        error = "Use a URL that starts with http:// or https://.";
      } else if (url.username || url.password) {
        error = "Use a URL without an embedded username or password.";
      } else if (destination.length > 2048) {
        error = "The destination URL must be 2,048 characters or fewer.";
      }
    } catch {
      error = "Enter a complete URL, such as https://example.com.";
    }
    setUrlError(error);
    if (error) {
      urlInput.current?.focus();
      return;
    }
    creation.mutate({ destinationUrl: destination, ...(title.trim() && { title: title.trim() }) });
  }

  return (
    <div className="min-h-svh bg-slate-50/70">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-5 sm:px-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Link2 className="size-6" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Link Shortener</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10 sm:px-8 sm:py-14">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My links</h1>
          <p className="text-muted-foreground">Short links. Simple sharing.</p>
        </div>

        <Card className="gap-6 py-6 shadow-none sm:py-8">
          <CardHeader className="px-6 sm:px-8">
            <CardTitle><h2 className="text-xl font-semibold">Create a short link</h2></CardTitle>
            <CardDescription>Paste a destination and get a link with a shareable QR code.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 sm:px-8">
            <form noValidate onSubmit={handleSubmit} className="space-y-5" aria-busy={creation.isPending}>
              <div className="space-y-2">
                <label htmlFor="destination-url" className="text-sm font-medium">Destination URL</label>
                <Input
                  ref={urlInput}
                  id="destination-url"
                  name="destinationUrl"
                  type="url"
                  required
                  maxLength={2048}
                  placeholder="https://example.com/portfolio"
                  autoComplete="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={destinationUrl}
                  disabled={creation.isPending}
                  aria-invalid={!!urlError}
                  aria-describedby={urlError ? "url-error" : "url-hint"}
                  className="h-12 px-4"
                  onChange={(event) => {
                    setDestinationUrl(event.target.value);
                    setUrlError("");
                    if (creation.isError) creation.reset();
                  }}
                />
                {urlError ? (
                  <p id="url-error" role="alert" className="text-sm text-destructive">{urlError}</p>
                ) : (
                  <p id="url-hint" className="text-xs text-muted-foreground">Include http:// or https://.</p>
                )}
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <label htmlFor="link-title" className="text-sm font-medium">
                    Title <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    id="link-title"
                    name="title"
                    maxLength={120}
                    placeholder="e.g. My portfolio"
                    value={title}
                    disabled={creation.isPending}
                    className="h-12 px-4"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <Button type="submit" className="h-12 gap-2 px-6" disabled={creation.isPending}>
                  {creation.isPending ? "Generating…" : "Generate link"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
              {creation.isError && (
                <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                  {creation.error.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        {creation.data ? (
          <LinkResult key={creation.data.id} initialLink={creation.data} headingRef={resultHeading} />
        ) : (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/5 text-primary">
                <QrCode className="size-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-medium">Your next link starts here</h2>
                <p className="text-sm text-muted-foreground">Generate a link to preview and download its QR code.</p>
              </div>
              <Button variant="outline" className="h-10 gap-2 px-4" disabled>
                <Download aria-hidden="true" /> Download QR
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
