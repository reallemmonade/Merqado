import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

const PATHS = {
  inbox: [<Path key="a" d="M4 13h4l2 3h4l2-3h4" />, <Path key="b" d="M5 5h14l1 8v6H4v-6z" />],
  chats: [<Path key="a" d="M4 5h16v11H9l-5 4z" />],
  spark: [<Path key="a" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />],
  tasks: [<Rect key="a" x="4" y="4" width="16" height="16" rx="3" />, <Path key="b" d="m8 12 3 3 5-6" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  send: [<Path key="a" d="M12 19V5M6 11l6-6 6 6" />],
  back: [<Path key="a" d="m15 5-7 7 7 7" />],
  chevronDown: [<Path key="a" d="m6 9 6 6 6-6" />],
  check: [<Path key="a" d="m5 12 5 5 9-10" />],
  search: [<Circle key="a" cx="11" cy="11" r="7" />, <Path key="b" d="m20 20-4-4" />],
  pin: [<Path key="a" d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />, <Path key="b" d="M12 14v6" />],
  menu: [<Path key="a" d="M4 7h16M4 12h16M4 17h10" />],
  edit: [<Path key="a" d="M4 20h4L19 9l-4-4L4 16z" />],
  copy: [<Rect key="a" x="8" y="8" width="12" height="12" rx="2" />, <Path key="b" d="M16 8V4H4v12h4" />],
  share: [<Path key="a" d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" />],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color = "#17132a", stroke = 1.8 }: { name: IconName; size?: number; color?: ColorValue; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}
