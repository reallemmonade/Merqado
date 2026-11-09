import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C, colorFor, F, initials } from "@/lib/theme";

export function Avatar({ name, size = 40, square = false, idKey }: { name: string; size?: number; square?: boolean; idKey?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: square ? size * 0.28 : size / 2, backgroundColor: colorFor(idKey ?? name), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: F.semibold, fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

export function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, active ? s.pillOn : s.pillOff]} accessibilityRole="button" accessibilityState={{ selected: !!active }}>
      <Text style={[s.pillText, { color: active ? "#fff" : C.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ n, style }: { n: number; style?: StyleProp<ViewStyle> }) {
  if (n <= 0) return null;
  return (
    <View style={[s.badge, style]}>
      <Text style={s.badgeText}>{n > 99 ? "99+" : n}</Text>
    </View>
  );
}

export function LargeTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={s.titleRow}>
      <Text style={s.title}>{title}</Text>
      {right}
    </View>
  );
}

/** What a list shows when it has no rows: loading, an error with Retry, or a short empty line and action. */
export function ListState({ loading, error, empty, onRetry, action }: { loading?: boolean; error?: string | null; empty: string; onRetry?: () => void; action?: { label: string; onPress: () => void } }) {
  if (loading) return <View style={s.state}><ActivityIndicator color={C.orchid} /></View>;
  if (error) {
    return (
      <View style={s.state}>
        <Text style={s.stateText}>{error}</Text>
        {onRetry && <Button label="Retry" onPress={onRetry} quiet />}
      </View>
    );
  }
  return (
    <View style={s.state}>
      <Text style={s.stateText}>{empty}</Text>
      {action && <Button label={action.label} onPress={action.onPress} />}
    </View>
  );
}

export function Button({ label, onPress, quiet = false, disabled = false }: { label: string; onPress: () => void; quiet?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.button, quiet ? s.buttonQuiet : s.buttonMain, disabled && { opacity: 0.4 }]}>
      <Text style={[s.buttonText, { color: quiet ? C.orchid : "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  state: { alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 64, paddingHorizontal: 32 },
  stateText: { fontFamily: F.regular, fontSize: 16, color: C.muted, textAlign: "center" },
  button: { height: 44, paddingHorizontal: 22, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  buttonMain: { backgroundColor: C.orchid },
  buttonQuiet: { backgroundColor: "transparent" },
  buttonText: { fontFamily: F.semibold, fontSize: 15 },
  section: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, fontSize: 12, fontFamily: F.semibold, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: "center" },
  pillOn: { backgroundColor: C.ink },
  pillOff: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e4e0ec" },
  pillText: { fontSize: 13, fontFamily: F.medium },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: C.orchid, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 12, fontFamily: F.semibold },
  titleRow: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 30, fontFamily: F.semibold, color: C.ink, letterSpacing: -0.5 },
});
