import { Text, View } from "react-native";
import type { GptSource } from "@/lib/api";
import { C, F } from "@/lib/theme";

/** Renders a case GPT answer: bullets, citations, and expert quotes in the serif. */
export function Answer({ body, sources }: { body: string; sources: GptSource[] }) {
  const lines = body.replace(/\*\*/g, "").split(/\n+/).filter((l) => l.trim());
  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, i) => {
        const bullet = /^\s*[-•*]\s+/.test(line);
        const text = line.replace(/^\s*[-•*]\s+/, "").replace(/^#+\s*/, "");
        return (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            {bullet && <Text style={{ fontFamily: F.semibold, color: C.orchid, fontSize: 15, lineHeight: 22 }}>•</Text>}
            <Inline text={text} />
          </View>
        );
      })}
      {sources.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {sources.map((s) => (
            <View key={s.n} style={{ flexDirection: "row", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: "#e4e0ec", maxWidth: "100%" }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.orchid }}>{s.n}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.ink, flexShrink: 1 }} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(“[^”]{12,}”|"[^"]{12,}"|\[\d{1,3}\])/);
  return (
    <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.ink }}>
      {parts.map((p, i) => {
        if (/^\[\d{1,3}\]$/.test(p))
          return (
            <Text key={i} style={{ fontFamily: F.semibold, fontSize: 11, color: C.orchid }}>
              {" "}
              {p.slice(1, -1)}
            </Text>
          );
        if (/^[“"]/.test(p))
          return (
            <Text key={i} style={{ fontFamily: F.serifItalic, fontSize: 17 }}>
              {p}
            </Text>
          );
        return p;
      })}
    </Text>
  );
}
