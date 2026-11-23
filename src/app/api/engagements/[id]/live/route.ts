import { NextResponse } from "next/server";
import { authorize } from "@/lib/experts/api";
import { caseVersion, subscribeCase } from "@/lib/live/hub";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/** Server-sent events: the case's version now and after every change, for live tabs and windows. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const version = (v: string) => send(`event: v\ndata: ${v}\n\n`);
      send("retry: 3000\n\n");
      version(caseVersion(id));
      const unsubscribe = subscribeCase(id, version);
      const beat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(beat);
        unsubscribe();
        cleanup = () => {};
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
