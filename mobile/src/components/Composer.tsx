import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { C, F } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import type { Member } from "@/lib/api";
import { Avatar } from "@/components/ui";

/** Message box with @mention suggestions. */
export function Composer({ placeholder, onSend, members = [], big = false }: { placeholder: string; onSend: (text: string) => Promise<void> | void; members?: Member[]; big?: boolean }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const query = text.match(/(?:^|\s)@([^\s@]*)$/)?.[1];
  const suggestions = query === undefined ? [] : members.filter((m) => m.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await onSend(body);
      setText("");
    } catch (e) {
      // Keep the text so it can be sent again.
      Alert.alert(e instanceof Error ? e.message : "Not sent");
    } finally {
      setSending(false);
    }
  }

  function pick(m: Member) {
    setText(text.replace(/@([^\s@]*)$/, `@${m.name} `));
  }

  return (
    <View style={{ backgroundColor: "#fff", borderTopWidth: big ? 0 : 1, borderTopColor: C.line, paddingBottom: Math.max(insets.bottom, 8) }}>
      {suggestions.map((m) => (
        <Pressable key={m.id} onPress={() => pick(m)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Avatar name={m.name} size={28} idKey={m.id} />
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }}>{m.name}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.muted }}>{m.title}</Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8 }}>
        <View style={{ flex: 1, minHeight: big ? 48 : 40, borderRadius: big ? 24 : 20, borderWidth: 1, borderColor: "#e4e0ec", backgroundColor: big ? C.bg : "#fff", flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 4 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={C.muted}
            multiline
            accessibilityLabel={placeholder}
            style={{ flex: 1, fontFamily: F.regular, fontSize: 16, color: C.ink, paddingVertical: 9, maxHeight: 140 }}
          />
          {members.length > 0 && (
            <Pressable onPress={() => setText((t) => (t && !t.endsWith(" ") ? `${t} @` : `${t}@`))} accessibilityLabel="Mention" style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 17, color: C.muted }}>@</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          accessibilityLabel="Send"
          style={{ width: big ? 48 : 40, height: big ? 48 : 40, borderRadius: 24, backgroundColor: text.trim() ? C.orchid : "#d9d3e3", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="send" size={18} color="#fff" stroke={2.4} />
        </Pressable>
      </View>
    </View>
  );
}
