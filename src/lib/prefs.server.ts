import { cookies } from "next/headers";
import { parsePrefs, PREFS_COOKIE, type Prefs } from "./prefs";

export async function getPrefs(): Promise<Prefs> {
  const jar = await cookies();
  return parsePrefs(jar.get(PREFS_COOKIE)?.value);
}
