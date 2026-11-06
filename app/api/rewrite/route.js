import { NextResponse } from "next/server";

// Optional AI step: rewrites the post to fix the flagged issues while keeping the creator's intent.
// If no key is set, the app still works (rule-based checker + one-click fixes).
export async function POST(req) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "AI key is not set on the server. The rule-based checker still works." });
  }
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: "Bad request." });
  }
  const { content, issues = [], facts = [] } = body;
  if (!content || content.length > 4000) {
    return NextResponse.json({ error: "Content is empty or too long (max 4000 characters)." });
  }

  const prompt =
    "You are a brand editor. Rewrite the post below so it fixes the listed issues while keeping the author's original purpose and meaning.\n" +
    "Rules: do not invent facts, numbers, awards or claims. Use only the approved facts given. If a claim cannot be supported, remove or soften it. " +
    "Keep a calm, confident tone. Keep roughly the same length and format. Return ONLY the rewritten post, no explanations.\n\n" +
    "ISSUES:\n" + (issues.length ? issues.map((i) => "- " + i).join("\n") : "- none") + "\n\n" +
    "APPROVED FACTS:\n" + (facts.length ? facts.map((f) => "- " + f).join("\n") : "- none") + "\n\n" +
    "POST:\n" + content;

  const models = [process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"].filter(Boolean);
  let lastError = "AI request failed.";
  for (const model of models) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const data = await r.json();
      const text = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map((p) => p.text || "").join("").trim()
        : "";
      if (text) return NextResponse.json({ rewrite: text, model });
      lastError = (data && data.error && data.error.message) || lastError;
    } catch (e) {
      lastError = String(e);
    }
  }
  return NextResponse.json({ error: "AI could not answer right now: " + lastError });
}
