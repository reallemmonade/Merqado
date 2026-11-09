import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SettingsShell } from "@/components/SettingsShell";
import { StorageSettings } from "@/components/StorageSettings";
import { getSessionUser } from "@/lib/session";
import { firmStorage } from "@/lib/storage/connections";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  admin: "Only firm admins can connect storage.",
  setup: "Google sign-in isn't set up on the server.",
  denied: "Google access was not granted.",
  state: "That sign-in expired. Try again.",
  token: "Google didn't return a lasting sign-in. Try again.",
  scope: "Drive access wasn't granted. Tick the Drive box and try again.",
  drive: "Couldn't reach Google Drive. Check that the Drive API is on for this Google app.",
};

export default async function StorageSettingsPage({ searchParams }: { searchParams: Promise<{ from?: string | string[]; error?: string }> }) {
  const { from, error } = await searchParams;
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) redirect("/welcome");
  const current = await firmStorage(db, user.firmId);
  const drive = current?.config.kind === "gdrive" ? current.config : null;

  return (
    <SettingsShell user={user} section="storage" from={typeof from === "string" ? from : undefined}>
      <StorageSettings
        isAdmin={user.isAdmin}
        error={error ? (ERRORS[error] ?? "Something went wrong.") : null}
        drive={drive ? { folderName: drive.rootName, folderUrl: `https://drive.google.com/drive/folders/${drive.rootFolderId}`, account: drive.account } : null}
        other={current && !drive ? current.label : null}
      />
    </SettingsShell>
  );
}
