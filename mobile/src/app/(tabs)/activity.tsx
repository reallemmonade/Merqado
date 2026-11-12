import { useEffect, useMemo, useState } from "react";
import { ActionSheetIOS, FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, API_URL, type InboxItem } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { inboxAction, setBadge } from "@/lib/push";
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
  { key: "approval", label: "Experts" },
] as const;

const SNOOZES = [
  { until: "hour", label: "Snooze 1 hour" },
  { until: "tomorrow", label: "Snooze until tomorrow 08:30" },
  { until: "monday", label: "Snooze until Monday 08:30" },
] as const;

export default function Activity() {
  const c = useCase();
  const { data, error, loading, refreshing, refresh, reload } = useApi<{ items: InboxItem[] }>("/api/mobile/inbox", 30000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [gone, setGone] = useState<Set<string>>(new Set());
  const open = useMemo(() => (data?.items ?? []).filter((i) => !gone.has(i.id)), [data, gone]);
  // The case pill picks the case, as on every other tab.
  const items = useMemo(() => open.filter((i) => (!c || i.caseId === c.id) && (filter === "all" || i.kind === filter)), [open, filter, c]);
  // The app icon badge is the open count across all cases.
  useEffect(() => {
    if (data) setBadge(open.length);
  }, [data, open.length]);

  const act = async (key: string, body: { action: "done" } | { action: "snooze"; until: (typeof SNOOZES)[number]["until"] }) => {
    setGone((g) => new Set(g).add(key));
    try {
      await api("/api/inbox", { body: { key, ...body } });
    } catch {
      setGone((g) => {
        const n = new Set(g);
        n.delete(key);
        return n;
      });
    }
    void reload();
  };
  const more = (item: InboxItem) =>
    ActionSheetIOS.showActionSheetWithOptions({ options: [...SNOOZES.map((o) => o.label), "Done", "Cancel"], cancelButtonIndex: SNOOZES.length + 1 }, (i) => {
      if (i < SNOOZES.length) void act(item.id, { action: "snooze", until: SNOOZES[i]!.until });
      else if (i === SNOOZES.length) void act(item.id, { action: "done" });
    });

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
        renderItem={({ item }) => <Row item={item} onDone={() => act(item.id, { action: "done" })} onMore={() => more(item)} />}
      />
    </SafeAreaView>
  );
}

function Row({ item, onDone, onMore }: { item: InboxItem; onDone: () => void; onMore: () => void }) {
  const isTask = item.kind === "task" || item.kind === "review" || item.kind === "todo" || item.kind === "approval";
  const color = item.flag === "overdue" ? C.late : item.kind === "review" || item.kind === "approval" ? C.slate : isTask ? C.rose : colorFor(item.title);
  const label = { mention: "Mention", reply: "Reply", task: "Task", review: "Review", todo: "To-do", approval: "Approve expert" }[item.kind] ?? "";
  const flag = item.flag && item.days !== undefined ? `${item.flag === "overdue" ? "Overdue" : "Idle"} ${item.days}d · ` : "";
  const open = () => {
    if (item.status === "unread") void inboxAction(item.id, "read").catch(() => {});
    if (item.roomId) router.push(`/case/${item.caseId}/room/${item.roomId}${item.threadId ? `?thread=${item.threadId}` : ""}`);
    else if (item.kind === "approval" && item.expertId) void Linking.openURL(`${API_URL}/e/${item.caseId}/experts?expert=${item.expertId}`);
    else router.push("/tasks");
  };
  return (
    <Pressable onPress={open} onLongPress={onMore} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? C.soft : "transparent" })}>
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
        <Text style={{ fontFamily: F.medium, fontSize: 12, color }}>{`${flag}${label} · ${item.caseName}`}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, color: C.text }} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Done" hitSlop={8} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? C.soft : C.card })}>
        <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.ink }}>✓</Text>
      </Pressable>
    </Pressable>
  );
}
