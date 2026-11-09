import { NextResponse } from "next/server";
import { gptName } from "@/lib/case/names";
import { mobileAuth, myCases } from "@/lib/mobile/data";

/** Who is signed in and the cases they can open. */
export async function GET() {
  const auth = await mobileAuth();
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const cases = await myCases(db, user);
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, title: user.title, archetype: user.archetype },
    cases: cases.map((c) => ({ ...c, gptName: gptName(c.codeName) })),
  });
}
