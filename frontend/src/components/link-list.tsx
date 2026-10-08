import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { listLinks } from "../lib/links";
import { LinkResult } from "./link-result";

export function LinkList() {
  const query = useQuery({
    queryKey: ["links"],
    queryFn: ({ signal }) => listLinks(signal),
    refetchInterval: (query) => !query.state.error && query.state.data?.some((link) => ["pending", "processing"].includes(link.qr.status)) ? 2_000 : false,
    retry: false,
  });

  return (
    <section aria-labelledby="saved-links-heading" className="space-y-4">
      <h2 id="saved-links-heading" className="text-xl font-semibold">
        Saved links {query.data && <span className="text-sm font-normal text-muted-foreground">({query.data.length})</span>}
      </h2>
      {query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading saved links…</p>}
      {query.isError && (
        <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
        </div>
      )}
      {query.data?.length === 0 && (
        <Card className="shadow-none">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No saved links yet. Generate your first link above.
          </CardContent>
        </Card>
      )}
      <ul className="space-y-4">
        {query.data?.map((link) => <li key={link.id}><LinkResult link={link} /></li>)}
      </ul>
    </section>
  );
}
