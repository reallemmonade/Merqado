import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Newsreader_400Regular, Newsreader_400Regular_Italic } from "@expo-google-fonts/newsreader";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { handleResponse, registerCategories, registerForPush } from "@/lib/push";
import { C } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

function Gate() {
  const { ready, me } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    const onSignIn = segments[0] === "sign-in";
    if (!me && !onSignIn) router.replace("/sign-in");
    else if (me && onSignIn) router.replace("/");
  }, [ready, me, segments, router]);

  useEffect(() => {
    if (!me) return;
    void registerCategories();
    void registerForPush().catch(() => {});
  }, [me]);

  useEffect(() => {
    if (me && lastResponse) void handleResponse(lastResponse);
  }, [me, lastResponse]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.orchid} />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
      <Stack.Screen name="cases" options={{ presentation: "formSheet", sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Newsreader_400Regular, Newsreader_400Regular_Italic });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
