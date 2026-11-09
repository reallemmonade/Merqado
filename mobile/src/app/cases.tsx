import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { C, F } from "@/lib/theme";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";

/** Case picker sheet, plus who's signed in and sign out. */
export default function Cases() {
  const { me, caseId, setCaseId, signOut } = useAuth();
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingVertical: 24 }}>
      <Text style={{ fontFamily: F.semibold, fontSize: 20, color: C.ink, paddingHorizontal: 20, paddingBottom: 12 }}>Cases</Text>
      {me?.cases.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => {
            setCaseId(c.id);
            router.back();
          }}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}
        >
          <Avatar name={c.codeName.replace(/^project\s+/i, "")} square size={40} idKey={c.id} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.ink }}>{c.codeName}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.muted }} numberOfLines={1}>
              {c.title}
            </Text>
          </View>
          {c.id === caseId && <Icon name="check" color={C.orchid} />}
        </Pressable>
      ))}
      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16, marginHorizontal: 20 }} />
      {me && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 }}>
          <Avatar name={me.user.name} size={36} idKey={me.user.id} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }}>{me.user.name}</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: C.muted }}>{me.user.title}</Text>
          </View>
          <Pressable onPress={signOut} accessibilityRole="button" style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e4e0ec", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink }}>Sign out</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
