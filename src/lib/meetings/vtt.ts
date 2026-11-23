/**
 * Teams transcripts come as WebVTT with each cue spoken by one person:
 *   00:00:04.120 --> 00:00:07.900
 *   <v Person 40>We moved two catheter lines last year.</v>
 * This turns them into readable turns ("Person 40 00:04 We moved ..."), joining a speaker's
 * back-to-back cues into one turn.
 */
export function vttToText(vtt: string): string {
  const lines = vtt.replace(/\r/g, "").split("\n");
  const turns: { who: string; at: string; text: string }[] = [];
  let at = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    const time = line.match(/^(\d{1,2}:)?(\d{2}):(\d{2})[.,]\d+\s*-->/);
    if (time) {
      const h = time[1] ? Number(time[1].slice(0, -1)) : 0;
      at = h ? `${h}:${time[2]}:${time[3]}` : `${time[2]}:${time[3]}`;
      continue;
    }
    if (!line || line === "WEBVTT" || /^(NOTE|STYLE|REGION)\b/.test(line) || lines[i + 1]?.includes("-->")) continue;
    const voice = line.match(/^<v\s+([^>]+)>([\s\S]*?)(<\/v>)?$/);
    const who = voice ? voice[1]!.trim() : "";
    const text = (voice ? voice[2]! : line).replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.who === who) last.text += ` ${text}`;
    else turns.push({ who, at, text });
  }
  return turns.map((t) => [t.who, t.at, t.text].filter(Boolean).join(" ")).join("\n");
}
