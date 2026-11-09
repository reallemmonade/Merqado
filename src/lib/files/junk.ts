/** System and lock files that come along with dropped folders but aren't case material. */
export function isJunk(name: string): boolean {
  return name.startsWith(".") || name.startsWith("~$") || /^(thumbs\.db|desktop\.ini|icon\r)$/i.test(name);
}
