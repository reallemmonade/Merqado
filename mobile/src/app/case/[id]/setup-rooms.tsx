import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, type ChatList } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { PickSheet } from "@/components/PickSheet";

/** Pick which role-based rooms this case gets. */
export default function SetupRooms() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<ChatList>(`/api/mobile/cases/${id}/rooms`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const templates = data?.templates ?? [];

  useEffect(() => {
    if (data) setPicked(new Set(data.templates.map((t) => t.name)));
  }, [data]);

  function toggle(name: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  }

  async function create() {
    setBusy(true);
    try {
      await api(`/api/engagements/${id}/channel`, { body: { op: "rooms.setup", names: [...picked] } });
      router.back();
    } catch (e) {
      Alert.alert("Not created", e instanceof Error ? e.message : "Try again.");
      setBusy(false);
    }
  }

  return (
    <PickSheet
      title="Rooms"
      action="Create"
      busy={busy}
      picked={picked}
      onToggle={toggle}
      onDone={create}
      loading={loading}
      error={error}
      onRetry={reload}
      empty="No rooms"
      rows={templates.map((t) => ({ id: t.name, title: t.name, sub: t.who }))}
    />
  );
}
