import { useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Pressable, RefreshControl, ScrollView, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type Task, type TaskStatus, type Todo } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, F } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { Icon } from "@/components/Icon";
import { LargeTitle, ListState, Pill, SectionLabel } from "@/components/ui";

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string; ring: string }> = {
  not_yet: { label: "Not yet", bg: "#f0eef4", fg: "#4a4560", ring: "#c9c3d6" },
  in_progress: { label: "In progress", bg: C.soft, fg: "#7a3a78", ring: C.orchid },
  almost_done: { label: "For review", bg: "#fdf0f6", fg: "#a81e65", ring: C.rose },
  done: { label: "Done", bg: "#e8f3ec", fg: C.green, ring: C.green },
};
const MOVE: Record<TaskStatus, string> = { not_yet: "Not started", in_progress: "Start", almost_done: "Send for review", done: "Mark done" };

/** YYYY-MM-DD in the phone's own time zone. */
function day(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bucket(due: string | null): string {
  if (!due) return "Later";
  const now = new Date();
  const today = day(now);
  if (due < today) return "Overdue";
  if (due === today) return "Today";
  const week = day(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  return due <= week ? "This week" : "Later";
}

type Todos = { todos: Todo[]; suggested: Todo[]; people: { id: string; name: string; title: string }[] };

export default function Tasks() {
  const c = useCase();
  const { data, error, loading, refreshing, refresh, reload, setData } = useApi<{ tasks: Task[] }>("/api/mobile/tasks");
  const [view, setView] = useState<"mine" | "review" | "todos">("mine");
  const sections = useMemo(() => {
    const all = (data?.tasks ?? []).filter((t) => !c || t.caseId === c.id);
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
  }, [data, view, c]);

  function move(t: Task, status: TaskStatus) {
    // A reviewer sending work back can leave a note for the assignee.
    if (t.toReview && t.status === "almost_done" && status !== "done") {
      Alert.prompt("Send back", undefined, (note) => void save(t, status, note?.trim() || undefined), "plain-text");
      return;
    }
    void save(t, status);
  }

  async function save(t: Task, status: TaskStatus, note?: string) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setData((d) => (d ? { tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, status, moves: [] } : x)) } : d));
    try {
      await api(`/api/engagements/${t.caseId}/workplan`, { body: { op: "task.update", id: t.id, status, ...(note && { note }) } });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Error");
    }
    await refresh();
  }

  function pick(t: Task) {
    if (!t.moves.length) return;
    const options = [...t.moves.map((m) => MOVE[m]), "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: t.title }, (i) => {
      if (i < t.moves.length) move(t, t.moves[i]!);
    });
  }

  /** The circle does the obvious next step: finish, or approve when reviewing. */
  function quick(t: Task) {
    const next = t.moves.includes("done") ? "done" : t.moves.includes("almost_done") ? "almost_done" : null;
    if (next) move(t, next);
    else pick(t);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle title="Tasks" right={<CaseSwitch />} />
      <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
        <Pill label="Mine" active={view === "mine"} onPress={() => setView("mine")} />
        <Pill label="To review" active={view === "review"} onPress={() => setView("review")} />
        <Pill label="To-dos" active={view === "todos"} onPress={() => setView("todos")} />
      </ScrollView>
      {view === "todos" ? (
        <TodoList caseId={c?.id ?? null} />
      ) : (
      <SectionList
        ListEmptyComponent={<ListState loading={loading} error={error} onRetry={reload} empty={view === "review" ? "Nothing to review" : "No tasks"} />}
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
      )}
    </SafeAreaView>
  );
}

/** The case's to-dos: tick to finish, tap for more, accept or dismiss AI suggestions. */
function TodoList({ caseId }: { caseId: string | null }) {
  const { data, error, loading, refreshing, refresh, reload, setData } = useApi<Todos>(caseId ? `/api/mobile/cases/${caseId}/todos` : null);
  const sections = useMemo(() => {
    const open = data?.todos ?? [];
    return [
      { title: "Suggested", data: data?.suggested ?? [] },
      { title: "Mine", data: open.filter((t) => t.mine) },
      { title: "Team", data: open.filter((t) => !t.mine) },
    ].filter((s) => s.data.length);
  }, [data]);

  async function op(body: Record<string, unknown>) {
    if (!caseId) return;
    try {
      await api(`/api/engagements/${caseId}/todos`, { body });
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : "Error");
    }
    await reload();
  }

  function add() {
    Alert.prompt("New to-do", undefined, (title) => {
      if (title?.trim()) void op({ op: "add", title: title.trim(), assigneeId: null });
    }, "plain-text");
  }

  function done(t: Todo) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setData((d) => (d ? { ...d, todos: d.todos.filter((x) => x.id !== t.id) } : d));
    void op({ op: "done", id: t.id, done: true });
  }

  function more(t: Todo, suggested: boolean) {
    const people = data?.people ?? [];
    const options = suggested ? ["Accept", "Dismiss", "Cancel"] : ["Assign", "Rename", "Delete", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, title: t.title, cancelButtonIndex: options.length - 1, destructiveButtonIndex: suggested ? 1 : 2 }, (i) => {
      const choice = options[i];
      if (choice === "Accept") void op({ op: "accept", id: t.id });
      if (choice === "Dismiss") void op({ op: "dismiss", id: t.id });
      if (choice === "Delete") void op({ op: "delete", id: t.id });
      if (choice === "Rename") {
        Alert.prompt("Rename", undefined, (title) => {
          if (title?.trim()) void op({ op: "update", id: t.id, title: title.trim() });
        }, "plain-text", t.title);
      }
      if (choice === "Assign") {
        const names = [...people.map((p) => p.name), "Nobody", "Cancel"];
        ActionSheetIOS.showActionSheetWithOptions({ options: names, cancelButtonIndex: names.length - 1 }, (j) => {
          if (j < people.length) void op({ op: "update", id: t.id, assigneeId: people[j]!.id });
          else if (j === people.length) void op({ op: "update", id: t.id, assigneeId: null });
        });
      }
    });
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(t) => t.id}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
      ListHeaderComponent={
        caseId ? (
          <Pressable onPress={add} accessibilityRole="button" style={{ marginHorizontal: 16, marginTop: 6, height: 48, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: "#c9c6d2", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 }}>
            <Icon name="plus" size={20} color={C.orchid} stroke={2.2} />
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }}>Add to-do</Text>
          </Pressable>
        ) : undefined
      }
      ListEmptyComponent={<ListState loading={loading} error={error} onRetry={reload} empty="No to-dos" />}
      renderSectionHeader={({ section }) => <SectionLabel>{section.title}</SectionLabel>}
      renderItem={({ item, index, section }) => {
        const suggested = section.title === "Suggested";
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
            {suggested ? (
              <Icon name="spark" size={22} color={C.orchid} />
            ) : (
              <Pressable onPress={() => done(item)} accessibilityLabel="Done" hitSlop={10} style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.orchid, backgroundColor: "#fff" }} />
            )}
            <Pressable onPress={() => more(item, suggested)} accessibilityRole="button" style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }}>{item.title}</Text>
              {!!(item.assignee || item.source) && (
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }} numberOfLines={1}>
                  {[item.mine ? "" : item.assignee, item.source].filter(Boolean).join(" · ")}
                </Text>
              )}
            </Pressable>
            {suggested ? (
              <Pressable onPress={() => op({ op: "accept", id: item.id })} accessibilityRole="button" style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.orchid, justifyContent: "center" }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: "#fff" }}>Accept</Text>
              </Pressable>
            ) : (
              item.due && <Text style={{ fontFamily: F.medium, fontSize: 12, color: bucket(item.due) === "Overdue" ? C.late : C.muted }}>{fmtDue(item.due)}</Text>
            )}
          </View>
        );
      }}
    />
  );
}

function fmtDue(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
