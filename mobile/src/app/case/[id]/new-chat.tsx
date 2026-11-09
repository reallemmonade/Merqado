import { useMemo, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, type ChatList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, F } from "@/lib/theme";
import { PickSheet } from "@/components/PickSheet";
import { Avatar } from "@/components/ui";

/** Pick teammates on this case and open a 1:1 or group chat. */
export default function NewChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data, error, loading, reload } = useApi<ChatList>(`/api/mobile/cases/${id}/rooms`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => (data?.people ?? []).filter((p) => p.id !== me?.user.id), [data, me]);

  function toggle(pid: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  }

  async function start() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>(`/api/engagements/${id}/channel`, { body: { op: "chat.open", userIds: [...picked], ...(picked.size > 1 && name.trim() && { name: name.trim() }) } });
      router.replace(`/case/${id}/room/${r.id}`);
    } catch (e) {
      Alert.alert("Not started", e instanceof Error ? e.message : "Try again.");
      setBusy(false);
    }
  }

  return (
    <PickSheet
      title="New chat"
      action="Start"
      busy={busy}
      picked={picked}
      onToggle={toggle}
      onDone={start}
      loading={loading}
      error={error}
      onRetry={reload}
      empty="No teammates on this case"
      rows={people.map((p) => ({ id: p.id, title: p.name, sub: p.title, left: <Avatar name={p.name} idKey={p.id} /> }))}
      header={
        picked.size > 1 ? (
          <View style={{ marginHorizontal: 16, marginVertical: 6, gap: 6 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.muted, letterSpacing: 0.6 }}>NAME</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Optional" placeholderTextColor={C.muted} style={{ height: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#e4e2ea", fontFamily: F.regular, fontSize: 15, color: C.ink }} />
          </View>
        ) : null
      }
    />
  );
}
