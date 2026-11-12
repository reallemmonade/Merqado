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
  cases: { id: string; codeName: string; title: string; status: string; access: string; role: string; gptName: string }[];
};
export type Person = { id: string; name: string; initials: string; title: string; presence: "available" | "away" | "busy" | "offline" | string };
export type Chat = {
  id: string;
  kind: "room" | "dm" | "group";
  name: string;
  sub: string;
  memberIds: string[];
  otherId: string | null;
  last: { author: string; text: string; at: string } | null;
  lastAt: string | null;
  unread: number;
  mentioned: number;
};
export type Reaction = { emoji: string; count: number; mine: boolean; names: string[] };
export type Message = {
  id: string;
  authorId: string | null;
  author: string;
  initials: string;
  at: string;
  body: string;
  kind: "text" | "meeting" | "call";
  meta: { title?: string; startsAt?: string; minutes?: number; link?: string | null; video?: boolean; endedAt?: string | null };
  pinned: boolean;
  mine: boolean;
  edited: boolean;
  mentionsMe: boolean;
  files: { id: string; filename: string; folder: string; pending: boolean }[];
  reactions: Reaction[];
  replies: { count: number; lastAt: string | null; authors: string[] };
};
export type Member = { id: string; name: string; title: string };
export type GptChat = { id: string; title: string; shared: boolean; pinned: boolean; updatedAt: string; owner: string; mine: boolean };
export type GptSource = { n: number; label: string; href: string; text: string };
export type GptMessage = { id: string; role: "user" | "assistant"; body: string; sources: GptSource[]; at: string };
export type TaskStatus = "not_yet" | "in_progress" | "almost_done" | "done";
export type Task = {
  id: string;
  caseId: string;
  caseName: string;
  title: string;
  status: TaskStatus;
  module: string;
  due: string | null;
  mine: boolean;
  toReview: boolean;
  assignee: string;
  reviewNote: string;
  moves: TaskStatus[];
};
export type InboxItem = {
  id: string;
  kind: "mention" | "reply" | "task" | "review" | "todo" | "approval";
  status?: "unread" | "read" | "snoozed";
  caseId: string;
  caseName: string;
  title: string;
  body: string;
  at: string;
  roomId?: string;
  messageId?: string;
  threadId?: string;
  taskId?: string;
  todoId?: string;
  expertId?: string;
  flag?: "overdue" | "idle";
  days?: number;
};
export type Todo = {
  id: string;
  caseId: string;
  caseName: string;
  title: string;
  status: "open" | "suggested";
  assigneeId: string | null;
  assignee: string;
  due: string | null;
  mine: boolean;
  sourceLabel: string;
  canDelete: boolean;
};

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "✅", "👀"] as const;

export type CaseTodo = { id: string; title: string; assigneeId: string | null; assignee: string; due: string | null; source: string; mine: boolean };
export type RoomTemplate = { name: string; who: string };
export type ChatList = { chats: Chat[]; people: Person[]; canSetup: boolean; templates: RoomTemplate[] };
