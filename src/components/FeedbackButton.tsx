"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./case/icons";

const MAX_BYTES = 4 * 1024 * 1024;

/** Sidebar button: a note and an optional screenshot, sent to the team. */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !pop.current?.contains(t))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function readImage(file: File | undefined | null) {
    if (!file || !file.type.startsWith("image/") || file.size > MAX_BYTES)
      return;
    const reader = new FileReader();
    reader.onload = () =>
      setPhoto(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function send() {
    if (!note.trim() || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, photo, page: window.location.pathname }),
      });
      if (!res.ok) throw new Error("failed");
      setState("sent");
      setTimeout(() => {
        setNote("");
        setPhoto(null);
        setState("idle");
        setOpen(false);
      }, 900);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="fb-wrap" ref={wrap}>
      <button
        type="button"
        className="fb-open"
        aria-label="Feedback"
        title="Feedback"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="message" />
      </button>
      {open &&
        createPortal(
          <div className="fb-pop" role="dialog" aria-label="Feedback" ref={pop}>
            {state === "sent" ? (
              <div className="fb-sent">Sent</div>
            ) : (
              <>
                <div className="fb-head">
                  <span>Feedback</span>
                  <button
                    type="button"
                    className="fb-close"
                    aria-label="Close"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                <label
                  className="fb-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    readImage(e.dataTransfer.files[0]);
                  }}
                >
                  {photo ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt="" />
                      <span
                        className="fb-x"
                        role="button"
                        aria-label="Remove photo"
                        onClick={(e) => {
                          e.preventDefault();
                          setPhoto(null);
                        }}
                      >
                        ✕
                      </span>
                    </>
                  ) : (
                    <span>Add photo</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => readImage(e.target.files?.[0])}
                  />
                </label>
                <textarea
                  aria-label="Note"
                  placeholder="Note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onPaste={(e) => {
                    const item = [...e.clipboardData.items].find((i) =>
                      i.type.startsWith("image/"),
                    );
                    if (item) readImage(item.getAsFile());
                  }}
                />
                <button
                  type="button"
                  className="fb-send"
                  disabled={!note.trim() || state === "sending"}
                  onClick={send}
                >
                  Send
                </button>
                {state === "error" && <div className="fb-err">Try again</div>}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
