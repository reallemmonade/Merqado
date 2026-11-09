import { useMemo, useState } from "react";
import { Pressable, RefreshControl, SectionList, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Chat, ChatList } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, colorFor, F, initials, shortTime } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { Icon } from "@/components/Icon";
import { Badge, LargeTitle, ListState, SectionLabel } from "@/components/ui";

export default function Chats() {
  const c = useCase();
  const { data, error, loading, refreshing, refresh, reload } = useApi<ChatList>(c ? `/api/mobile/cases/${c.id}/rooms` : null, 15000);
  const [q, setQ] = useState("");
  const sections = useMemo(() => {
    const all = (data?.chats ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
    const byRecent = (a: Chat, b: Chat) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
    return [
      { title: "Rooms", data: all.filter((r) => r.kind === "room") },
      { title: "Chats", data: all.filter((r) => r.kind !== "room").sort(byRecent) },
    ].filter((s) => s.data.length);
  }, [data, q, c]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle
        title="Chats"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <CaseSwitch />
            {c && (
              <Pressable
                onPress={() => router.push(`/case/${c.id}/new-chat`)}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.orchid, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="compose" size={19} color="#fff" stroke={2.2} />
              </Pressable>
            )}
          </View>
        }
      />
      <View style={{ paddingHorizontal: 20, paddingVertical: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.field }}>
          <Icon name="search" size={16} color={C.muted} stroke={2} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.muted} style={{ flex: 1, fontFamily: F.regular, fontSize: 15, color: C.ink }} accessibilityLabel="Search" />
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <ListState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={q.trim() ? "No matches" : "No chats"}
            action={!c || q.trim() ? undefined : data?.canSetup && !data.chats.some((r) => r.kind === "room") ? { label: "Set up rooms", onPress: () => router.push(`/case/${c.id}/setup-rooms`) } : { label: "New chat", onPress: () => router.push(`/case/${c.id}/new-chat`) }}
          />
        }
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/case/${c!.id}/room/${item.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: pressed ? C.soft : "transparent" })}
          >
            <View style={{ width: 44, height: 44, borderRadius: item.kind === "room" ? 12 : 22, backgroundColor: colorFor(item.otherId ?? item.id), alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontFamily: F.semibold, fontSize: 15 }}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: item.unread ? F.semibold : F.medium, fontSize: 16, color: C.ink }}>{item.name}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: item.mentioned ? C.orchid : C.muted }}>{item.mentioned ? "@ " : ""}{shortTime(item.lastAt)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: C.muted }} numberOfLines={1}>
                  {item.last ? `${item.last.author}: ${item.last.text}` : item.sub}
                </Text>
                <Badge n={item.unread} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
