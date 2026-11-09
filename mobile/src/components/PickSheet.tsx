import type { ReactNode } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, F } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import { ListState } from "@/components/ui";

export type PickRow = { id: string; title: string; sub?: string; left?: ReactNode };

/** A sheet with Cancel / title / action and a checklist of rows. */
export function PickSheet({
  title,
  action,
  busy,
  rows,
  picked,
  onToggle,
  onDone,
  loading,
  error,
  onRetry,
  empty,
  header,
}: {
  title: string;
  action: string;
  busy: boolean;
  rows: PickRow[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  onDone: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty: string;
  header?: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ height: 44, justifyContent: "center", paddingHorizontal: 6 }}>
          <Text style={{ fontFamily: F.regular, fontSize: 16, color: C.muted }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontFamily: F.semibold, fontSize: 17, color: C.ink }}>{title}</Text>
        <Pressable onPress={onDone} disabled={busy || !picked.size} accessibilityRole="button" style={{ height: 44, justifyContent: "center", paddingHorizontal: 6, opacity: busy || !picked.size ? 0.4 : 1 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.orchid }}>{action}</Text>
        </Pressable>
      </View>
      {header}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<ListState loading={loading} error={error} onRetry={onRetry} empty={empty} />}
        renderItem={({ item }) => {
          const on = picked.has(item.id);
          return (
            <Pressable
              onPress={() => onToggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? C.soft : "transparent" })}
            >
              {item.left}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.medium, fontSize: 16, color: C.ink }}>{item.title}</Text>
                {!!item.sub && <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.muted }}>{item.sub}</Text>}
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.orchid : "#c9c6d2", backgroundColor: on ? C.orchid : "#fff", alignItems: "center", justifyContent: "center" }}>
                {on && <Icon name="check" size={14} color="#fff" stroke={3} />}
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
