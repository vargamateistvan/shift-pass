const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface MessageHeader {
  name: string;
  value: string;
}

export interface MessageSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface MessageDetail extends MessageSummary {
  body: string;
}

type TokenGetter = () => Promise<string>;

async function authedFetch(
  getToken: TokenGetter,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const json = await res.json();
      detail = json?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(
      `Gmail API error ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res;
}

function header(headers: MessageHeader[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

/** Decode a base64url string (Gmail's body encoding) to UTF-8 text. */
function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

interface GmailPayloadPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
}

/** Walk the MIME tree and pull out the best-effort text body. */
function extractBody(payload: GmailPayloadPart | undefined): string {
  if (!payload) return "";
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html = payload.parts.find((p) => p.mimeType === "text/html");
    if (html?.body?.data) return decodeBase64Url(html.body.data);
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

export async function listMessages(
  getToken: TokenGetter,
  maxResults = 20,
): Promise<MessageSummary[]> {
  const res = await authedFetch(getToken, `/messages?maxResults=${maxResults}`);
  const data = (await res.json()) as {
    messages?: { id: string; threadId: string }[];
  };
  const ids = data.messages ?? [];
  return Promise.all(ids.map((m) => getMessageSummary(getToken, m.id)));
}

async function getMessageSummary(
  getToken: TokenGetter,
  id: string,
): Promise<MessageSummary> {
  const res = await authedFetch(
    getToken,
    `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
  );
  const data = (await res.json()) as {
    id: string;
    threadId: string;
    snippet: string;
    payload: { headers: MessageHeader[] };
  };
  const headers = data.payload.headers;
  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    date: header(headers, "Date"),
  };
}

export async function getMessage(
  getToken: TokenGetter,
  id: string,
): Promise<MessageDetail> {
  const res = await authedFetch(getToken, `/messages/${id}?format=full`);
  const data = (await res.json()) as {
    id: string;
    threadId: string;
    snippet: string;
    payload: GmailPayloadPart & { headers: MessageHeader[] };
  };
  const headers = data.payload.headers;
  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject"),
    date: header(headers, "Date"),
    body: extractBody(data.payload),
  };
}

/** Encode a UTF-8 string to base64url for the Gmail send endpoint. */
function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMessage(
  getToken: TokenGetter,
  params: { to: string; subject: string; body: string },
): Promise<void> {
  const { to, subject, body } = params;
  const raw = encodeBase64Url(
    [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "MIME-Version: 1.0",
      "",
      body,
    ].join("\r\n"),
  );
  await authedFetch(getToken, "/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
}
