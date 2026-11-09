/** Merqado Orchid look. */
export const C = {
  ink: "#17132a",
  text: "#3d3850",
  muted: "#5f5a70",
  bg: "#faf9fc",
  card: "#ffffff",
  line: "#ece9f2",
  field: "#efecf4",
  soft: "#f4eef6",
  orchid: "#9a4a96",
  rose: "#d0267e",
  slate: "#6a6fa3",
  green: "#1e7a4c",
  late: "#b4235e",
};

export const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  serifItalic: "Newsreader_400Regular_Italic",
  serif: "Newsreader_400Regular",
};

const PALETTE = [C.orchid, C.rose, C.slate, "#3d3850", "#7a3a78", "#a81e65"];

/** A steady color per person, so avatars don't change between screens. */
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase() || "?";
}

export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 6) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
