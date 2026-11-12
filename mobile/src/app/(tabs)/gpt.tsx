import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type GptChat } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, F, shortTime } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { Composer } from "@/components/Composer";
import { Icon } from "@/components/Icon";
import { LargeTitle, ListState, Pill } from "@/components/ui";

export default function Gpt() {
  const c = useCase();
  const { data, error, loading, refreshing, refresh, reload } = useApi<{ name: string; chats: GptChat[] }>(c ? `/api/mobile/cases/${c.id}/gpt` : null);
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const chats = useMemo(() => (data?.chats ?? []).filter((x) => (scope === "mine" ? x.mine : x.shared)), [data, scope]);
  const name = c?.gptName ?? "GPT";

  async function ask(question: string) {
    if (!c) return;
    const r = await api<{ id: string }>(`/api/engagements/${c.id}/gpt`, { body: { op: "new", question, shared: scope === "team" } });
    router.push(`/case/${c.id}/gpt/${r.id}?answer=1`);
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <LargeTitle title={name} right={<CaseSwitch />} />
        <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 8 }}>
          <Pill label="My chats" active={scope === "mine"} onPress={() => setScope("mine")} />
          <Pill label="Team chats" active={scope === "team"} onPress={() => setScope("team")} />
        </ScrollView>
        <FlatList
          data={chats}
          keyExtractor={(x) => x.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<ListState loading={loading} error={error} onRetry={reload} empty="No chats" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/case/${c!.id}/gpt/${item.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: pressed ? C.soft : "transparent" })}
            >
              <Icon name={item.pinned ? "pin" : "spark"} size={18} color={C.orchid} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.mine && <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{item.owner}</Text>}
              </View>
              <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{shortTime(item.updatedAt)}</Text>
            </Pressable>
          )}
        />
        <Composer big inTab placeholder={`Ask ${name}`} onSend={ask} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
