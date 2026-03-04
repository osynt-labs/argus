import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  // Only allow if SETUP_SECRET matches
  const secret = req.headers.get("x-setup-secret");
  if (!secret || secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json().catch(() => ({ name: "default" }));
  const rawKey = `argus_${randomBytes(24).toString("hex")}`;
  const hash = hashApiKey(rawKey);

  await prisma.apiKey.create({
    data: { name: name ?? "default", keyHash: hash },
  });

  return NextResponse.json({
    key: rawKey,
    message: "Store this key securely — it won't be shown again.",
  });
}
