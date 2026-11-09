import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "https://merqado.ai";

const TOKEN_KEY = "merqado.session";
let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export async function loadToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function saveToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Calls the Merqado API with this phone's session token. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    await saveToken(null);
    onSignedOut?.();
  }
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status);
  return data as T;
}

// Shapes the server returns.
export type Me = {
  user: { id: string; name: string; email: string; title: string; archetype: string };
  cases: { id: string; codeName: string; title: string; status: string; access: string; gptName: string }[];
};
export type Room = { id: string; name: string; lastBody: string; lastAuthor: string; lastAt: string | null; unread: number };
export type Message = { id: string; body: string; pinned: boolean; at: string; userId: string | null; author: string; mine: boolean };
export type Member = { id: string; name: string; title: string };
export type GptChat = { id: string; title: string; shared: boolean; pinned: boolean; updatedAt: string; owner: string; mine: boolean };
export type GptSource = { n: number; label: string; href: string; text: string };
export type GptMessage = { id: string; role: "user" | "assistant"; body: string; sources: GptSource[]; at: string };
export type Task = { id: string; caseId: string; caseName: string; title: string; status: TaskStatus; module: string; due: string | null; milestone: string | null };
export type TaskStatus = "not_yet" | "in_progress" | "almost_done" | "done";
export type InboxItem = {
  id: string;
  kind: "mention" | "task";
  caseId: string;
  caseName: string;
  title: string;
  body: string;
  at: string;
  roomId?: string;
  messageId?: string;
  taskId?: string;
};
