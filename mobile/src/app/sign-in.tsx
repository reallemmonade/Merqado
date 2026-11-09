import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { C, F } from "@/lib/theme";

export default function SignIn() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const err = await signIn();
    setBusy(false);
    if (err) setError("Sign-in failed");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: 32, gap: 40 }}>
      <Image source={require("../../assets/logo.png")} style={{ width: 220, height: 64 }} resizeMode="contain" accessibilityLabel="Merqado" />
      <View style={{ width: "100%", gap: 12 }}>
        <Pressable
          onPress={go}
          disabled={busy}
          accessibilityRole="button"
          style={{ height: 52, borderRadius: 14, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontFamily: F.semibold, fontSize: 16 }}>Sign in</Text>}
        </Pressable>
        {error && <Text style={{ color: C.late, fontFamily: F.medium, textAlign: "center" }}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}
