export type Link = {
  id: string;
  shortCode: string;
  shortUrl: string;
  destinationUrl: string;
  title: string;
  createdAt: string;
  warning?: { code: string; message: string };
  qr: {
    status: "pending" | "processing" | "ready" | "failed";
    imageUrl: string | null;
  };
};

export type CreateLinkInput = { destinationUrl: string; title?: string };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Request failed.");
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

export async function listLinks(signal: AbortSignal): Promise<Link[]> {
  const response = await request("/api/links", { signal });
  return response.json();
}

export async function downloadQr(link: Link) {
  const response = await request(`/api/links/${encodeURIComponent(link.id)}/qr/download`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${link.shortCode}-qr.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
