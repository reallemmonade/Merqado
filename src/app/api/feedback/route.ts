import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { getSessionUser } from "@/lib/session";

/** A screenshot as a data URL, up to about 4 MB. */
const Body = z.object({
  note: z.string().trim().min(1).max(4000),
  photo: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,/)
    .max(5_600_000)
    .nullable()
    .optional(),
});

/** Saves one feedback note (with an optional screenshot) for the signed-in person's firm. */
export async function POST(req: Request) {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a note" }, { status: 400 });
  await db.insert(schema.feedback).values({
    firmId: user.firmId,
    userId: user.id,
    note: parsed.data.note,
    photo: parsed.data.photo ?? null,
  });
  return NextResponse.json({ ok: true });
}
