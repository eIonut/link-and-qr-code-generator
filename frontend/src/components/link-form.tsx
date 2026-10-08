import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { createLink } from "../lib/links";
import { LinkList } from "./link-list";

export function LinkForm() {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [title, setTitle] = useState("");
  const queryClient = useQueryClient();
  const creation = useMutation({
    mutationFn: createLink,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["links"] }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    creation.mutate({ destinationUrl: destinationUrl.trim(), title: title.trim() });
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
            <form onSubmit={handleSubmit} className="space-y-5" aria-busy={creation.isPending}>
              <div className="space-y-2">
                <label htmlFor="destination-url" className="text-sm font-medium">Destination URL</label>
                <Input
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
                  aria-describedby="url-hint"
                  className="h-12 px-4"
                  onChange={(event) => {
                    setDestinationUrl(event.target.value);
                    if (creation.isError) creation.reset();
                  }}
                />
                <p id="url-hint" className="text-xs text-muted-foreground">Include http:// or https://.</p>
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
              {creation.data?.warning && <p role="alert" className="text-sm text-destructive">{creation.data.warning.message}</p>}
            </form>
          </CardContent>
        </Card>

        <LinkList />
      </main>
    </div>
  );
}
