import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Room } from "@/lib/api";
import { useCase } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { C, colorFor, F, initials, shortTime } from "@/lib/theme";
import { CaseSwitch } from "@/components/CaseSwitch";
import { Icon } from "@/components/Icon";
import { Badge, LargeTitle, SectionLabel } from "@/components/ui";

export default function Chats() {
  const c = useCase();
  const { data, refreshing, refresh } = useApi<{ rooms: Room[] }>(c ? `/api/mobile/cases/${c.id}/rooms` : null, 15000);
  const [q, setQ] = useState("");
  const rooms = useMemo(() => (data?.rooms ?? []).filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.bg }}>
      <LargeTitle title="Chats" right={<CaseSwitch />} />
      <View style={{ paddingHorizontal: 20, paddingVertical: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.field }}>
          <Icon name="search" size={16} color={C.muted} stroke={2} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.muted} style={{ flex: 1, fontFamily: F.regular, fontSize: 15, color: C.ink }} accessibilityLabel="Search" />
        </View>
      </View>
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={c ? <SectionLabel>{c.codeName}</SectionLabel> : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.orchid} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/case/${c!.id}/room/${item.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: pressed ? C.soft : "transparent" })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colorFor(item.id), alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontFamily: F.semibold, fontSize: 15 }}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: item.unread ? F.semibold : F.medium, fontSize: 16, color: C.ink }}>{item.name}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: C.muted }}>{shortTime(item.lastAt)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 14, color: C.muted }} numberOfLines={1}>
                  {item.lastAuthor ? `${item.lastAuthor.split(" ")[0]}: ${item.lastBody}` : ""}
                </Text>
                <Badge n={item.unread} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
