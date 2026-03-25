import crypto from "node:crypto";

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function fingerprint(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
