import { Tabs } from "expo-router";
import { useCase } from "@/lib/auth";
import { C, F } from "@/lib/theme";
import { Icon } from "@/components/Icon";

// The app opens on Chats.
export const unstable_settings = { initialRouteName: "index" };

export default function TabsLayout() {
  const c = useCase();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.orchid,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11 },
        tabBarStyle: { borderTopColor: C.line, backgroundColor: "rgba(255,255,255,0.96)" },
      }}
    >
      <Tabs.Screen name="activity" options={{ title: "Activity", tabBarIcon: ({ color }) => <Icon name="bell" color={color} size={24} /> }} />
      <Tabs.Screen name="index" options={{ title: "Chats", tabBarIcon: ({ color }) => <Icon name="chats" color={color} size={24} /> }} />
      <Tabs.Screen name="tasks" options={{ title: "To-dos", tabBarIcon: ({ color }) => <Icon name="tasks" color={color} size={24} /> }} />
      <Tabs.Screen name="gpt" options={{ title: c?.gptName ?? "GPT", tabBarIcon: ({ color }) => <Icon name="spark" color={color} size={24} /> }} />
    </Tabs>
  );
}
