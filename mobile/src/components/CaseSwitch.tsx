import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useCase } from "@/lib/auth";
import { C, F } from "@/lib/theme";
import { Icon } from "@/components/Icon";

/** The case pill in each tab's header; opens the case picker. */
export function CaseSwitch() {
  const c = useCase();
  return (
    <Pressable
      onPress={() => router.push("/cases")}
      accessibilityRole="button"
      accessibilityLabel="Switch case"
      style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: "#e4e0ec", backgroundColor: "#fff" }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.orchid }} />
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink }}>{c ? c.codeName.replace(/^project\s+/i, "") : "Cases"}</Text>
      <Icon name="chevronDown" size={12} color={C.muted} />
    </Pressable>
  );
}
