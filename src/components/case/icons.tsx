export const ICONS = {
  overview: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  gpt: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8zM18 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z",
  workplan: "M3 4h18v16H3zM3 9h18M9 4v16M15 4v16",
  experts: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
  deck: "M3 4h18v12H3zM12 16v4M8 20h8",
  channel: "M4 5h16v11H9l-5 4z",
  files: "M3 4h18v5H3zM5 9v10h14V9M10 13h4",
  dictionary: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  notes: "M6 3h9l4 4v14H6zM9 11h7M9 15h7",
  search: "M11 5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM20 20l-4.5-4.5",
  proposals: "M4 7h16v12H4zM9 7V5h6v2",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
