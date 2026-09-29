// Talks to the Node API. The self-contained preview build swaps in an in-browser copy of it.
const PREVIEW = import.meta.env.MODE === "preview";

export async function api(method, url, body) {
  if (PREVIEW) {
    const { handle } = await import("./demoApi.js");
    return handle(method, url, body);
  }
  const res = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`);
    err.status = res.status;
    err.fields = data?.fields;
    throw err;
  }
  return data;
}

export const isPreview = PREVIEW;
