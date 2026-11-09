import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type GptMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, F } from "@/lib/theme";
import { Answer } from "@/components/Answer";
import { Composer } from "@/components/Composer";
import { Icon } from "@/components/Icon";

type Payload = { chat: { id: string; title: string; shared: boolean; mine: boolean }; messages: GptMessage[] };

export default function GptChat() {
  const { id, chatId, answer } = useLocalSearchParams<{ id: string; chatId: string; answer?: string }>();
  const { me } = useAuth();
  const name = me?.cases.find((c) => c.id === id)?.gptName ?? "GPT";
  const [data, setData] = useState<Payload | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(false);
  const started = useRef(false);
  const path = `/api/mobile/cases/${id}/gpt/${chatId}`;

  const load = useCallback(async () => setData(await api<Payload>(path).catch(() => null)), [path]);

  const run = useCallback(
    async (op: { op: "answer" } | { op: "ask"; question: string }) => {
      setThinking(true);
      setError(false);
      try {
        await api(`/api/engagements/${id}/gpt`, { body: { ...op, chatId } });
      } catch {
        setError(true);
      }
      setThinking(false);
      await load();
    },
    [id, chatId, load],
  );

  useEffect(() => {
    void load();
    if (answer && !started.current) {
      started.current = true;
      void run({ op: "answer" });
    }
  }, [load, run, answer]);

  async function ask(question: string) {
    setData((d) => (d ? { ...d, messages: [...d.messages, { id: `tmp-${Date.now()}`, role: "user", body: question, sources: [], at: new Date().toISOString() }] } : d));
    await run({ op: "ask", question });
  }

  const msgs = data?.messages ?? [];
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={C.orchid} stroke={2.2} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: F.semibold, fontSize: 17, color: C.ink }} numberOfLines={1}>
          {name}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 18, gap: 18 }}
          ListFooterComponent={
            thinking ? (
              <ActivityIndicator color={C.orchid} style={{ alignSelf: "flex-start" }} />
            ) : error ? (
              <Pressable onPress={() => run({ op: "answer" })} accessibilityRole="button" style={{ alignSelf: "flex-start", height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e4e0ec", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.medium, color: C.ink }}>Retry</Text>
              </Pressable>
            ) : undefined
          }
          renderItem={({ item }) =>
            item.role === "user" ? (
              <View style={{ alignSelf: "flex-end", maxWidth: "82%", backgroundColor: C.soft, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.ink }}>{item.body}</Text>
              </View>
            ) : (
              <Answer body={item.body} sources={item.sources} />
            )
          }
        />
        <Composer big placeholder={`Ask ${name}`} onSend={ask} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
