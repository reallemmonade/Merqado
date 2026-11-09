import { NextResponse } from "next/server";
import { z } from "zod";
import { pushDevices } from "@/db/schema";
import { mobileAuth } from "@/lib/mobile/data";

const Body = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{32,200}$/),
  environment: z.enum(["production", "sandbox"]).default("production"),
});

/** Registers this iPhone for notifications (moves the token if someone else signs in on it). */
export async function POST(req: Request) {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad device token." }, { status: 400 });
  const { token, environment } = parsed.data;
  await auth.db
    .insert(pushDevices)
    .values({ userId: auth.user.id, token: token.toLowerCase(), environment })
    .onConflictDoUpdate({ target: pushDevices.token, set: { userId: auth.user.id, environment } });
  return NextResponse.json({ ok: true });
}
