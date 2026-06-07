export interface VaultEntry {
  id: string;
  site: string;
  host: string;
  email: string;
  password: string;
  rotatedAt: string;
  status: "rotated" | "dry_run" | "needs_human";
}

export async function listVaultEntries(): Promise<VaultEntry[]> {
  const res = await fetch("/api/vault");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Server error ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as { entries?: VaultEntry[] };
  return data.entries ?? [];
}
