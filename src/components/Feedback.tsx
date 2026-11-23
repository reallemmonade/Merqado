import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";
import { FeedbackButton } from "./FeedbackButton";

/** Feedback button, top right of every page, for signed-in people only. */
export async function Feedback() {
  const user = await getSessionUser(getDb()).catch(() => null);
  return user ? <FeedbackButton /> : null;
}
