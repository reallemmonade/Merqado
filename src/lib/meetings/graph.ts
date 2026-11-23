import { platformCredentials } from "@/lib/auth/platform";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

/** Calendar and meeting lookups; each person can grant these themselves. */
export const BASE_SCOPES = ["offline_access", "openid", "email", "User.Read", "Calendars.Read", "OnlineMeetings.Read"];
/** Teams transcripts and recordings; a tenant admin must approve these once. */
export const TRANSCRIPT_SCOPES = ["OnlineMeetingTranscript.Read.All", "OnlineMeetingRecording.Read.All"];

export const scopeString = (scopes: string[]) =>
  scopes.map((s) => (["offline_access", "openid", "email", "profile"].includes(s) ? s : `https://graph.microsoft.com/${s}`)).join(" ");

export class GraphError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function microsoftApp(): { clientId: string; clientSecret: string } {
  const creds = platformCredentials("microsoft");
  if (!creds) throw new Error("Microsoft sign-in is not set up.");
  return creds;
}

/** Trades a refresh token for an access token; Microsoft may hand back a new refresh token. */
export async function refreshAccess(refreshToken: string, scopes: string[]): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientId, clientSecret } = microsoftApp();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, scope: scopeString(scopes) }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!res.ok || !tok.access_token) throw new GraphError(res.status, tok.error_description?.split("\n")[0] ?? "Microsoft sign-in expired.");
  return { accessToken: tok.access_token, refreshToken: tok.refresh_token ?? refreshToken };
}

/** Exchanges the one-time code from the consent screen. */
export async function exchangeCode(code: string, redirectUri: string, verifier: string, scopes: string[]) {
  const { clientId, clientSecret } = microsoftApp();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: verifier,
      scope: scopeString(scopes),
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; id_token?: string };
  if (!res.ok || !tok.access_token || !tok.refresh_token) throw new GraphError(res.status, "Microsoft did not return a token.");
  return { accessToken: tok.access_token, refreshToken: tok.refresh_token, scope: tok.scope ?? "", idToken: tok.id_token ?? "" };
}

async function graph<T>(token: string, path: string, init: { accept?: string; raw?: boolean } = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="UTC"', ...(init.accept && { accept: init.accept }) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GraphError(res.status, body.error?.message ?? `Microsoft returned ${res.status}.`);
  }
  return (init.raw ? res : await res.json()) as T;
}

/** One calendar event, as Graph returns it (only the fields asked for). */
export interface GraphEvent {
  id: string;
  iCalUId: string;
  subject?: string | null;
  isCancelled?: boolean;
  isAllDay?: boolean;
  start: { dateTime: string };
  end: { dateTime: string };
  organizer?: { emailAddress?: { address?: string } };
  attendees?: { emailAddress?: { address?: string } }[];
  onlineMeetingProvider?: string | null;
  onlineMeeting?: { joinUrl?: string | null } | null;
}

export interface CalendarMeeting {
  externalId: string;
  subject: string;
  startAt: Date;
  minutes: number;
  people: string[];
  source: "teams" | "outlook";
  joinUrl: string | null;
}

/** Graph times come back in UTC without a zone mark. */
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/** Keeps meetings that already ended and had other people in them. */
export function toMeeting(ev: GraphEvent, now: Date): CalendarMeeting | null {
  if (ev.isCancelled || ev.isAllDay) return null;
  const start = utc(ev.start.dateTime);
  const end = utc(ev.end.dateTime);
  if (!(end <= now) || Number.isNaN(start.getTime())) return null;
  const people = [ev.organizer?.emailAddress?.address, ...(ev.attendees ?? []).map((a) => a.emailAddress?.address)]
    .filter((x): x is string => !!x)
    .map((x) => x.toLowerCase());
  const joinUrl = ev.onlineMeeting?.joinUrl ?? null;
  const teams = ev.onlineMeetingProvider === "teamsForBusiness" && !!joinUrl;
  return {
    externalId: ev.iCalUId || ev.id,
    subject: ev.subject ?? "",
    startAt: start,
    minutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)),
    people: [...new Set(people)],
    source: teams ? "teams" : "outlook",
    joinUrl: teams ? joinUrl : null,
  };
}

/** The person's calendar between two times, all pages. */
export async function listEvents(token: string, from: Date, to: Date): Promise<GraphEvent[]> {
  const select = "id,iCalUId,subject,isCancelled,isAllDay,start,end,organizer,attendees,onlineMeetingProvider,onlineMeeting";
  let url: string | undefined =
    `/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$select=${select}&$top=100&$orderby=start/dateTime`;
  const out: GraphEvent[] = [];
  for (let page = 0; url && page < 10; page++) {
    const body: { value: GraphEvent[]; "@odata.nextLink"?: string } = await graph(token, url);
    out.push(...body.value);
    url = body["@odata.nextLink"];
  }
  return out;
}

/** The Teams meeting behind a join link, or null if this person can't see it. */
export async function findOnlineMeeting(token: string, joinUrl: string): Promise<string | null> {
  const filter = encodeURIComponent(`JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`);
  const body = await graph<{ value: { id: string }[] }>(token, `/me/onlineMeetings?$filter=${filter}`);
  return body.value[0]?.id ?? null;
}

/** The newest transcript of a meeting as WebVTT text, or null when there is none yet. */
export async function latestTranscript(token: string, meetingId: string): Promise<string | null> {
  const list = await graph<{ value: { id: string; createdDateTime?: string }[] }>(token, `/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`);
  const t = list.value.sort((a, b) => (b.createdDateTime ?? "").localeCompare(a.createdDateTime ?? ""))[0];
  if (!t) return null;
  const res = await graph<Response>(token, `/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(t.id)}/content?$format=text/vtt`, {
    accept: "text/vtt",
    raw: true,
  });
  return res.text();
}

/** The newest recording's id, or null. */
export async function latestRecording(token: string, meetingId: string): Promise<string | null> {
  const list = await graph<{ value: { id: string; createdDateTime?: string }[] }>(token, `/me/onlineMeetings/${encodeURIComponent(meetingId)}/recordings`);
  return list.value.sort((a, b) => (b.createdDateTime ?? "").localeCompare(a.createdDateTime ?? ""))[0]?.id ?? null;
}

/** Streams a recording's video from Microsoft. */
export async function recordingStream(token: string, meetingId: string, recordingId: string): Promise<Response> {
  return graph<Response>(token, `/me/onlineMeetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/content`, { raw: true });
}
