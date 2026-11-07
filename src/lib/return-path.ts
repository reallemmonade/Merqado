/** A same-site path to return to; anything else (missing, absolute, protocol-relative) goes home. */
export function safeReturnPath(from: string | undefined): string {
  return from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/\\") ? from : "/";
}
