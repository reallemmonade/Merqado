import { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheetIOS, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, type Member, type Message } from "@/lib/api";
import { C, F, shortTime } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import { Composer } from "@/components/Composer";
import { Avatar } from "@/components/ui";

type Payload = { room: { id: string; name: string }; members: Member[]; messages: Message[] };

export default function RoomScreen() {
  const { id, roomId } = useLocalSearchParams<{ id: string; roomId: string }>();
  const base = `/api/mobile/cases/${id}/rooms/${roomId}`;
  const [room, setRoom] = useState<Payload["room"] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const lastAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    const after = lastAt.current;
    const d = await api<Payload>(after ? `${base}?after=${encodeURIComponent(after)}` : base).catch(() => null);
    if (!d) return;
    setRoom(d.room);
    setMembers(d.members);
    if (d.messages.length) {
      lastAt.current = d.messages[d.messages.length - 1]!.at;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return after ? [...prev, ...d.messages.filter((m) => !seen.has(m.id))] : d.messages;
      });
    }
  }, [base]);

  useEffect(() => {
    lastAt.current = null;
    setMessages([]);
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function send(body: string) {
    await api(`/api/engagements/${id}/channel`, { body: { op: "message.post", roomId, body } });
    await load();
  }

  function actions(m: Message) {
    void Haptics.selectionAsync();
    const options = [m.pinned ? "Unpin" : "Pin", "Ask GPT", "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, async (i) => {
      if (i === 0) {
        await api(`/api/engagements/${id}/channel`, { body: { op: "message.pin", id: m.id, pinned: !m.pinned } }).catch(() => {});
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned: !m.pinned } : x)));
      }
      if (i === 1) {
        const r = await api<{ id: string }>(`/api/engagements/${id}/gpt`, { body: { op: "new", question: m.body } }).catch(() => null);
        if (r) router.push(`/case/${id}/gpt/${r.id}?answer=1`);
      }
    });
  }

  const reversed = [...messages].reverse();

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={C.orchid} stroke={2.2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 17, color: C.ink }}>{room?.name ?? ""}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{members.length || ""}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          inverted
          data={reversed}
          keyExtractor={(m) => m.id}
          style={{ backgroundColor: C.bg }}
          contentContainerStyle={{ padding: 14, gap: 6 }}
          renderItem={({ item, index }) => {
            const older = reversed[index + 1];
            const grouped = !!older && older.userId === item.userId && new Date(item.at).getTime() - new Date(older.at).getTime() < 5 * 60 * 1000;
            return <Bubble m={item} grouped={grouped} onLongPress={() => actions(item)} />;
          }}
        />
        <Composer placeholder="Message" members={members} onSend={send} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Body({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(/(@[\p{L}][\p{L}'-]*(?: [\p{L}][\p{L}'-]*)?)/u);
  return (
    <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: mine ? "#fff" : C.ink }}>
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <Text key={i} style={{ fontFamily: F.semibold, color: mine ? "#fff" : C.orchid }}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

function Bubble({ m, grouped, onLongPress }: { m: Message; grouped: boolean; onLongPress: () => void }) {
  if (m.mine) {
    return (
      <Pressable onLongPress={onLongPress} style={{ alignSelf: "flex-end", maxWidth: "80%", marginTop: grouped ? 0 : 8 }}>
        <View style={{ backgroundColor: C.orchid, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 13, paddingVertical: 9 }}>
          <Body text={m.body} mine />
        </View>
        {m.pinned && <Text style={{ alignSelf: "flex-end", fontFamily: F.medium, fontSize: 11, color: C.muted, marginTop: 2 }}>Pinned</Text>}
      </Pressable>
    );
  }
  return (
    <Pressable onLongPress={onLongPress} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: grouped ? 0 : 8, maxWidth: "85%" }}>
      <View style={{ width: 30 }}>{!grouped && <Avatar name={m.author || "?"} size={30} idKey={m.userId ?? m.author} />}</View>
      <View style={{ flexShrink: 1, gap: 3 }}>
        {!grouped && (
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted, paddingLeft: 4 }}>
            {m.author} · {shortTime(m.at)}
          </Text>
        )}
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 13, paddingVertical: 9 }}>
          <Body text={m.body} mine={false} />
        </View>
        {m.pinned && <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.muted, paddingLeft: 4 }}>Pinned</Text>}
      </View>
    </Pressable>
  );
}
