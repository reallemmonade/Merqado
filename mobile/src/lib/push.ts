import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { api } from "@/lib/api";

let deviceToken: string | null = null;

export async function currentDeviceToken() {
  return deviceToken;
}

/** Show banners while the app is open too. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/** Lock-screen buttons. Their ids match the `category` the server sends. */
export async function registerCategories() {
  await Notifications.setNotificationCategoryAsync("MESSAGE", [
    { identifier: "reply", buttonTitle: "Reply", textInput: { submitButtonTitle: "Send", placeholder: "Message" }, options: { opensAppToForeground: true } },
    { identifier: "read", buttonTitle: "Mark read", options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync("TASK", [{ identifier: "open", buttonTitle: "Open", options: { opensAppToForeground: true } }]);
}

/** Asks for permission and sends this iPhone's Apple push token to Merqado. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  const { data } = await Notifications.getDevicePushTokenAsync();
  deviceToken = String(data);
  // Development builds talk to Apple's sandbox; TestFlight and App Store builds to production.
  const environment = Constants.expoConfig?.extra?.apnsEnvironment === "sandbox" || __DEV__ ? "sandbox" : "production";
  await api("/api/mobile/devices", { body: { token: deviceToken, environment } });
}

/** Opens the right screen when a notification is tapped, or sends a lock-screen reply. */
export async function handleResponse(res: Notifications.NotificationResponse) {
  const data = res.notification.request.content.data as { url?: string; caseId?: string; roomId?: string };
  if (res.actionIdentifier === "reply" && res.userText && data.caseId && data.roomId) {
    await api(`/api/engagements/${data.caseId}/channel`, { body: { op: "message.post", roomId: data.roomId, body: res.userText } }).catch(() => {});
  }
  if (res.actionIdentifier === "read" && data.caseId && data.roomId) {
    await api(`/api/mobile/cases/${data.caseId}/rooms/${data.roomId}`, { body: {} }).catch(() => {});
    return;
  }
  if (typeof data.url === "string" && data.url.startsWith("/")) router.push(data.url as never);
}
