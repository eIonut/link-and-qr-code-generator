export type Link = {
  id: string;
  shortCode: string;
  shortUrl: string;
  destinationUrl: string;
  title: string;
  createdAt: string;
  qr: {
    status: "pending" | "processing" | "ready" | "failed";
    imageUrl: string | null;
  };
};

export type CreateLinkInput = { destinationUrl: string; title?: string };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Could not reach the link service. Please try again.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message ??
        (response.status === 404
          ? "The requested link endpoint is not available."
          : "The link service could not complete the request. Please try again."),
    );
  }
  return response;
}

export async function createLink(input: CreateLinkInput): Promise<Link> {
  const response = await request("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}

export async function getLink(id: string, signal: AbortSignal): Promise<Link> {
  const response = await request(`/api/links/${encodeURIComponent(id)}`, { signal });
  return response.json();
}

export async function downloadQr(link: Link) {
  const response = await request(`/api/links/${encodeURIComponent(link.id)}/qr/download`);
  if (!response.headers.get("Content-Type")?.startsWith("image/png")) {
    throw new Error("The QR image is not available for download yet.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const filename = (link.title || link.shortCode).replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
  anchor.href = url;
  anchor.download = `${filename || "link"}-qr.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
