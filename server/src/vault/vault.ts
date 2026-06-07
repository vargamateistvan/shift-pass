import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const VAULT_PATH = fileURLToPath(new URL("../../vault.json", import.meta.url));

export type VaultEntry = {
  id: string;
  site: string;
  host: string;
  email: string;
  password: string;
  rotatedAt: string;
  status: "rotated" | "dry_run" | "needs_human";
};

type EncFile = { v: 1; iv: string; tag: string; data: string };

function key(): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(config.vaultKey)) {
    throw new Error(
      "VAULT_KEY must be 64 hex chars (32 bytes). See server/.env.example",
    );
  }
  return Buffer.from(config.vaultKey, "hex");
}

function encrypt(entries: VaultEntry[]): EncFile {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(entries), "utf8"),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: data.toString("hex"),
  };
}

function decrypt(file: EncFile): VaultEntry[] {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(file.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(file.tag, "hex"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(file.data, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(out.toString("utf8")) as VaultEntry[];
}

async function readAll(): Promise<VaultEntry[]> {
  if (!existsSync(VAULT_PATH)) return [];
  const raw = await readFile(VAULT_PATH, "utf8");
  if (!raw.trim()) return [];
  return decrypt(JSON.parse(raw) as EncFile);
}

export async function saveEntry(entry: VaultEntry): Promise<void> {
  const entries = await readAll();
  entries.unshift(entry);
  await writeFile(VAULT_PATH, JSON.stringify(encrypt(entries)), "utf8");
}

/** Returns entries with passwords masked unless `reveal` is set. */
export async function listEntries(reveal = false): Promise<VaultEntry[]> {
  const entries = await readAll();
  if (reveal) return entries;
  return entries.map((e) => ({ ...e, password: "••••••••" }));
}
