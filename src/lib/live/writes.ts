import { after } from "next/server";
import { headers } from "next/headers";
import { publishCaseChange } from "./hub";
import { CASE_WRITE_HEADER } from "./paths";

/**
 * Called once a request has been allowed onto a case. When the proxy marked it as a write to that
 * case, tells everyone watching the case once the response has gone out (so the write has landed).
 */
export async function noteCaseWrite(engagementId: string): Promise<void> {
  let id: string | null;
  try {
    id = (await headers()).get(CASE_WRITE_HEADER);
  } catch {
    return; // outside a request (scripts, jobs)
  }
  if (id !== engagementId) return;
  after(() => publishCaseChange(engagementId));
}
