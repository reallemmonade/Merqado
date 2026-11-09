import { useCallback, useEffect, useState } from "react";
import { ActionSheetIOS, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { api, QUICK_REACTIONS, type Member, type Message } from "@/lib/api";
import { C, F, shortTime } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import { Composer } from "@/components/Composer";
import { Avatar } from "@/components/ui";

type Payload = { room: { id: string; kind: string; name: string }; members: Member[]; parent: Message | null; messages: Message[] };

export default function RoomScreen() {
  const { id, roomId, thread } = useLocalSearchParams<{ id: string; roomId: string; thread?: string }>();
  const path = `/api/mobile/cases/${id}/rooms/${roomId}${thread ? `?thread=${thread}` : ""}`;
  const [data, setData] = useState<Payload | null>(null);

  const load = useCallback(async () => {
    const d = await api<Payload>(path).catch(() => null);
    if (d) setData(d);
  }, [path]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }, [load]),
  );

  const channel = (body: Record<string, unknown>) => api(`/api/engagements/${id}/channel`, { body });

  async function send(body: string) {
    await channel({ op: "message.post", roomId, body, ...(thread && { parentId: thread }) });
    await load();
  }

  async function react(m: Message, emoji: string) {
    void Haptics.selectionAsync();
    await channel({ op: "reaction.toggle", id: m.id, emoji }).catch(() => {});
    await load();
  }

  function actions(m: Message) {
    void Haptics.selectionAsync();
    const extra = [...(thread ? [] : ["Reply in thread"]), m.pinned ? "Unpin" : "Pin", "Ask GPT"];
    const options = [...QUICK_REACTIONS, ...extra, "Cancel"];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1 }, async (i) => {
      const choice = options[i];
      if (i < QUICK_REACTIONS.length) return react(m, choice!);
      if (choice === "Reply in thread") router.push(`/case/${id}/room/${roomId}?thread=${m.id}`);
      if (choice === "Pin" || choice === "Unpin") {
        await channel({ op: "message.pin", id: m.id, pinned: !m.pinned }).catch(() => {});
        await load();
      }
      if (choice === "Ask GPT") {
        const r = await api<{ id: string }>(`/api/engagements/${id}/gpt`, { body: { op: "new", question: m.body } }).catch(() => null);
        if (r) router.push(`/case/${id}/gpt/${r.id}?answer=1`);
      }
    });
  }

  const messages = data?.messages ?? [];
  const reversed = [...messages].reverse();
  const title = thread ? "Thread" : (data?.room.name ?? "");

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="back" color={C.orchid} stroke={2.2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 17, color: C.ink }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{thread ? data?.room.name : data?.members.length || ""}</Text>
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
          ListFooterComponent={
            data?.parent ? (
              <View style={{ paddingBottom: 12, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Bubble m={data.parent} grouped={false} onLongPress={() => {}} onReact={(e) => react(data.parent!, e)} inThread />
              </View>
            ) : undefined
          }
          renderItem={({ item, index }) => {
            const older = reversed[index + 1];
            const grouped = !!older && older.authorId === item.authorId && older.kind === "text" && new Date(item.at).getTime() - new Date(older.at).getTime() < 5 * 60 * 1000;
            return (
              <Bubble
                m={item}
                grouped={grouped}
                inThread={!!thread}
                onLongPress={() => actions(item)}
                onReact={(e) => react(item, e)}
                onReplies={() => router.push(`/case/${id}/room/${roomId}?thread=${item.id}`)}
              />
            );
          }}
        />
        <Composer placeholder={thread ? "Reply" : "Message"} members={data?.members ?? []} onSend={send} />
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

function Extras({ m, onReact, onReplies, inThread }: { m: Message; onReact: (emoji: string) => void; onReplies?: () => void; inThread?: boolean }) {
  const right = m.mine;
  if (!m.reactions.length && !m.files.length && !(m.replies.count && !inThread) && !m.pinned) return null;
  return (
    <View style={{ gap: 4, alignItems: right ? "flex-end" : "flex-start", paddingHorizontal: 4 }}>
      {m.files.map((f) => (
        <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 10, color: C.slate }}>{(f.filename.split(".").pop() ?? "").toUpperCase().slice(0, 4)}</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.ink, maxWidth: 220 }} numberOfLines={1}>
            {f.filename}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {m.reactions.map((r) => (
          <Pressable
            key={r.emoji}
            onPress={() => onReact(r.emoji)}
            accessibilityLabel={`${r.emoji} ${r.count}`}
            style={{ flexDirection: "row", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: r.mine ? C.soft : "#fff", borderWidth: 1, borderColor: r.mine ? C.orchid : C.line }}
          >
            <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.ink }}>{r.count}</Text>
          </Pressable>
        ))}
        {!inThread && m.replies.count > 0 && (
          <Pressable onPress={onReplies} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.orchid }}>
              {m.replies.count} {m.replies.count === 1 ? "reply" : "replies"}
            </Text>
          </Pressable>
        )}
        {m.pinned && <Text style={{ fontFamily: F.medium, fontSize: 11, color: C.muted }}>Pinned</Text>}
      </View>
    </View>
  );
}

function Special({ m }: { m: Message }) {
  const label = m.kind === "meeting" ? (m.meta.title ?? "Meeting") : m.meta.video ? "Video call" : "Call";
  const when = m.kind === "meeting" && m.meta.startsAt ? new Date(m.meta.startsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : m.meta.endedAt ? "Ended" : shortTime(m.at);
  return (
    <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: C.line, marginVertical: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.kind === "meeting" ? C.slate : C.green }} />
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink }}>{label}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.muted }}>{when}</Text>
    </View>
  );
}

function Bubble({
  m,
  grouped,
  onLongPress,
  onReact,
  onReplies,
  inThread,
}: {
  m: Message;
  grouped: boolean;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onReplies?: () => void;
  inThread?: boolean;
}) {
  if (m.kind !== "text") return <Special m={m} />;
  const text = m.body ? <Body text={m.body} mine={m.mine} /> : null;
  if (m.mine) {
    return (
      <Pressable onLongPress={onLongPress} style={{ alignSelf: "flex-end", maxWidth: "80%", marginTop: grouped ? 0 : 8, gap: 4 }}>
        {text && <View style={{ backgroundColor: C.orchid, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 13, paddingVertical: 9 }}>{text}</View>}
        <Extras m={m} onReact={onReact} onReplies={onReplies} inThread={inThread} />
      </Pressable>
    );
  }
  return (
    <Pressable onLongPress={onLongPress} style={{ flexDirection: "row", gap: 8, alignItems: "flex-end", marginTop: grouped ? 0 : 8, maxWidth: "85%" }}>
      <View style={{ width: 30 }}>{!grouped && <Avatar name={m.author || "?"} size={30} idKey={m.authorId ?? m.author} />}</View>
      <View style={{ flexShrink: 1, gap: 3 }}>
        {!grouped && (
          <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted, paddingLeft: 4 }}>
            {m.author} · {shortTime(m.at)}
          </Text>
        )}
        {text && (
          <View style={{ backgroundColor: "#fff", borderWidth: m.mentionsMe ? 2 : 1, borderColor: m.mentionsMe ? C.orchid : C.line, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 13, paddingVertical: 9 }}>
            {text}
          </View>
        )}
        <Extras m={m} onReact={onReact} onReplies={onReplies} inThread={inThread} />
      </View>
    </Pressable>
  );
}
