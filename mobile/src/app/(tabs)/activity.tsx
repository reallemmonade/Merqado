import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { InboxItem } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, colorFor, F, initials, shortTime } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { LargeTitle, ListState, Pill } from "@/components/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "mention", label: "Mentions" },
  { key: "reply", label: "Replies" },
  { key: "task", label: "Tasks" },
  { key: "todo", label: "To-dos" },
  { key: "review", label: "Reviews" },
] as const;

export default function Activity() {
  const c = useCase();
  const { data, error, loading, refreshing, refresh, reload } = useApi<{ items: InboxItem[] }>("/api/mobile/inbox", 30000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  // The case pill picks the case, as on every other tab.
  const items = useMemo(() => (data?.items ?? []).filter((i) => (!c || i.caseId === c.id) && (filter === "all" || i.kind === filter)), [data, filter, c]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle title="Activity" right={<CaseSwitch />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
        {FILTERS.map((f) => (
          <Pill key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
        ListEmptyComponent={<ListState loading={loading} error={error} onRetry={reload} empty="Nothing new" />}
        renderItem={({ item }) => <Row item={item} />}
      />
    </SafeAreaView>
  );
}

function Row({ item }: { item: InboxItem }) {
  const isTask = item.kind === "task" || item.kind === "review" || item.kind === "todo";
  const color = item.kind === "review" ? C.slate : isTask ? C.rose : colorFor(item.title);
  const label = { mention: "Mention", reply: "Reply", task: "Task", review: "Review", todo: "To-do" }[item.kind] ?? "";
  const open = () => {
    if (item.roomId) router.push(`/case/${item.caseId}/room/${item.roomId}${item.threadId ? `?thread=${item.threadId}` : ""}`);
    else router.push("/tasks");
  };
  return (
    <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? C.soft : "transparent" })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontFamily: F.semibold, fontSize: 14 }}>{isTask ? "✓" : initials(item.title)}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink, flex: 1 }} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{shortTime(item.at)}</Text>
        </View>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color }}>{`${label} · ${item.caseName}`}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, color: C.text }} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
    </Pressable>
  );
}
