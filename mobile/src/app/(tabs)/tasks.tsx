import { useMemo } from "react";
import { ActionSheetIOS, Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type Task, type TaskStatus } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { C, F } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { LargeTitle, SectionLabel } from "@/components/ui";

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string; ring: string }> = {
  not_yet: { label: "Not yet", bg: "#f0eef4", fg: "#4a4560", ring: "#c9c3d6" },
  in_progress: { label: "In progress", bg: C.soft, fg: "#7a3a78", ring: C.orchid },
  almost_done: { label: "Almost done", bg: "#fdf0f6", fg: "#a81e65", ring: C.rose },
  done: { label: "Done", bg: "#e8f3ec", fg: C.green, ring: C.green },
};
const ORDER: TaskStatus[] = ["not_yet", "in_progress", "almost_done", "done"];

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
  const sections = useMemo(() => {
    const open = (data?.tasks ?? []).filter((t) => t.status !== "done");
    const done = (data?.tasks ?? []).filter((t) => t.status === "done");
    const names = ["Overdue", "Today", "This week", "Later"];
    return [...names.map((title) => ({ title, data: open.filter((t) => bucket(t.due) === title) })), { title: "Done", data: done }].filter((s) => s.data.length);
  }, [data]);

  async function setStatus(t: Task, status: TaskStatus) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setData((d) => (d ? { tasks: d.tasks.map((x) => (x.id === t.id ? { ...x, status } : x)) } : d));
    await api(`/api/engagements/${t.caseId}/workplan`, { body: { op: "task.update", id: t.id, status } }).catch(() => refresh());
  }

  function pickStatus(t: Task) {
    const options = [...ORDER.map((s) => STATUS[s].label), "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: t.title }, (i) => {
      if (i < ORDER.length) void setStatus(t, ORDER[i]!);
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle title="Tasks" right={<CaseSwitch />} />
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
                onPress={() => setStatus(item, item.status === "done" ? "in_progress" : "done")}
                accessibilityLabel={item.status === "done" ? "Mark not done" : "Mark done"}
                hitSlop={10}
                style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: st.ring, backgroundColor: item.status === "done" ? C.green : "#fff" }}
              />
              <Pressable onPress={() => pickStatus(item)} accessibilityRole="button" style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, textDecorationLine: item.status === "done" ? "line-through" : "none" }}>{item.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: st.bg }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 12, color: st.fg }}>{st.label}</Text>
                  </View>
                  <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }} numberOfLines={1}>
                    {item.module} · {item.caseName.replace(/^project\s+/i, "")}
                  </Text>
                </View>
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
