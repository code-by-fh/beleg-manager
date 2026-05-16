import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm" as const;
const SEP = ":";

function getKey(): Buffer | null {
  const raw = process.env.BANK_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  return buf.length === 32 ? buf : null;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(SEP);
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  if (!key) return ciphertext;
  try {
    const parts = ciphertext.split(SEP);
    if (parts.length !== 3) return ciphertext;
    const [ivB64, authTagB64, dataB64] = parts as [string, string, string];
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data).toString("utf8") + decipher.final("utf8");
  } catch {
    return ciphertext;
  }
}
