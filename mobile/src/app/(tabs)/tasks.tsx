import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type Task, type TaskStatus } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { C, F } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { LargeTitle, Pill, SectionLabel } from "@/components/ui";

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string; ring: string }> = {
  not_yet: { label: "Not yet", bg: "#f0eef4", fg: "#4a4560", ring: "#c9c3d6" },
  in_progress: { label: "In progress", bg: C.soft, fg: "#7a3a78", ring: C.orchid },
  almost_done: { label: "For review", bg: "#fdf0f6", fg: "#a81e65", ring: C.rose },
  done: { label: "Done", bg: "#e8f3ec", fg: C.green, ring: C.green },
};
const MOVE: Record<TaskStatus, string> = { not_yet: "Not started", in_progress: "Start", almost_done: "Send for review", done: "Mark done" };

function bucket(due: string | null): string {
  if (!due) return "Later";
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return "Overdue";
  if (due === today) return "Today";
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return due <= week ? "This week" : "Later";
}

export default function Tasks() {
  const { data, refreshing, refresh, setData } = useApi<{ tasks: Task[] }>("/api/mobile/tasks");
  const [view, setView] = useState<"mine" | "review">("mine");
  const sections = useMemo(() => {
    const all = data?.tasks ?? [];
    if (view === "review") {
      const waiting = all.filter((t) => t.toReview && t.status === "almost_done");
      const other = all.filter((t) => t.toReview && t.status !== "almost_done" && t.status !== "done");
      return [
        { title: "Waiting on you", data: waiting },
        { title: "In progress", data: other },
      ].filter((s) => s.data.length);
    }
    const mine = all.filter((t) => t.mine);
    const open = mine.filter((t) => t.status !== "done");
    return [
      ...["Overdue", "Today", "This week", "Later"].map((title) => ({ title, data: open.filter((t) => bucket(t.due) === title) })),
      { title: "Done", data: mine.filter((t) => t.status === "done") },
    ].filter((s) => s.data.length);
  }, [data, view]);

  async function move(t: Task, status: TaskStatus) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setData((d) => (d ? { tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, status, moves: [] } : x)) } : d));
    try {
      await api(`/api/engagements/${t.caseId}/workplan`, { body: { op: "task.update", id: t.id, status } });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Error");
    }
    await refresh();
  }

  function pick(t: Task) {
    if (!t.moves.length) return;
    const options = [...t.moves.map((m) => MOVE[m]), "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: t.title }, (i) => {
      if (i < t.moves.length) void move(t, t.moves[i]!);
    });
  }

  /** The circle does the obvious next step: finish, or approve when reviewing. */
  function quick(t: Task) {
    const next = t.moves.includes("done") ? "done" : t.moves.includes("almost_done") ? "almost_done" : null;
    if (next) void move(t, next);
    else pick(t);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle title="Tasks" right={<CaseSwitch />} />
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
        <Pill label="Mine" active={view === "mine"} onPress={() => setView("mine")} />
        <Pill label="To review" active={view === "review"} onPress={() => setView("review")} />
      </ScrollView>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
        renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
        stickySectionHeadersEnabled={false}
        renderItem={({ item, index, section }) => {
          const st = STATUS[item.status];
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <View
              style={{
                marginHorizontal: 16,
                backgroundColor: "#fff",
                borderColor: C.line,
                borderWidth: 1,
                borderTopWidth: first ? 1 : 0,
                borderTopLeftRadius: first ? 14 : 0,
                borderTopRightRadius: first ? 14 : 0,
                borderBottomLeftRadius: last ? 14 : 0,
                borderBottomRightRadius: last ? 14 : 0,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Pressable
                onPress={() => quick(item)}
                disabled={!item.moves.length}
                accessibilityLabel={MOVE[item.moves.includes("done") ? "done" : "almost_done"]}
                hitSlop={10}
                style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: st.ring, backgroundColor: item.status === "done" ? C.green : "#fff" }}
              />
              <Pressable onPress={() => pick(item)} accessibilityRole="button" style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, textDecorationLine: item.status === "done" ? "line-through" : "none" }}>{item.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: st.bg }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 12, color: st.fg }}>{st.label}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 12, color: C.muted }} numberOfLines={1}>
                    {view === "review" && item.assignee ? `${item.assignee} · ` : ""}
                    {item.module} · {item.caseName.replace(/^project\s+/i, "")}
                  </Text>
                </View>
                {!!item.reviewNote && (
                  <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.late }} numberOfLines={2}>
                    {item.reviewNote}
                  </Text>
                )}
              </Pressable>
              {item.due && <Text style={{ fontFamily: F.medium, fontSize: 12, color: bucket(item.due) === "Overdue" ? C.late : C.muted }}>{fmtDue(item.due)}</Text>}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function fmtDue(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
