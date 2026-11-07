import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SettingsForm } from "@/components/SettingsForm";
import { SettingsShell } from "@/components/SettingsShell";
import { getPrefs } from "@/lib/prefs.server";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsAppearancePage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from } = await searchParams;
  const user = await getSessionUser(getDb());
  if (!user) redirect("/welcome");
  const prefs = await getPrefs();

  return (
    <SettingsShell user={user} section="appearance" from={typeof from === "string" ? from : undefined}>
      <SettingsForm initial={prefs} />
    </SettingsShell>
  );
}
