import { createHash } from "crypto";
import { prisma } from "./prisma";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(key: string): Promise<boolean> {
  if (!key) return false;
  const hash = hashApiKey(key);
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!record || !record.active) return false;
  await prisma.apiKey.update({
    where: { id: record.id },
    data: { lastUsed: new Date() },
  });
  return true;
}

export function getApiKeyFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const key = req.headers.get("x-api-key");
  return key;
}
