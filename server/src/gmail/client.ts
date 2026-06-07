const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailMessage = {
  id: string;
  from: string;
  subject: string;
  body: string;
  internalDate: number;
};

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

function header(headers: Header[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

function decode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/** Walk the MIME tree, preferring text/plain then text/html. */
function extractBody(payload: Part | undefined): string {
  if (!payload) return "";
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    return decode(payload.body.data);
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decode(plain.body.data);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return decode(html.body.data);
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

async function gmailFetch(token: string, path: string): Promise<Response> {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail =
        ((await res.json()) as { error?: { message?: string } })?.error
          ?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      `Gmail API error ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res;
}

export async function getMessage(
  token: string,
  id: string,
): Promise<GmailMessage> {
  const res = await gmailFetch(token, `/messages/${id}?format=full`);
  const data = (await res.json()) as {
    id: string;
    internalDate: string;
    payload: Part & { headers: Header[] };
  };
  return {
    id: data.id,
    internalDate: Number(data.internalDate),
    from: header(data.payload.headers, "From"),
    subject: header(data.payload.headers, "Subject"),
    body: extractBody(data.payload),
  };
}

/** Returns full messages matching `q`, newest first. */
export async function searchMessages(
  token: string,
  q: string,
): Promise<GmailMessage[]> {
  const res = await gmailFetch(
    token,
    `/messages?maxResults=10&q=${encodeURIComponent(q)}`,
  );
  const data = (await res.json()) as { messages?: { id: string }[] };
  const ids = (data.messages ?? []).map((m) => m.id);
  return Promise.all(ids.map((id) => getMessage(token, id)));
}
