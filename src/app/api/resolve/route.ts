import { NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";

/**
 * Suggests next steps for a notification using Gemini. It does not resolve anything itself, and it
 * never reports success without a real answer from the model.
 */
export async function POST(request: Request) {
  // Paid model call: 401 signed out, 403 account_disabled / no_organization.
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  let title: unknown, message: unknown, details: unknown;
  try {
    ({ title, message, details } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A notification title is required." }, { status: 400 });
  }

  const keyToUse = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!keyToUse) {
    return NextResponse.json(
      { error: "AI suggestions aren't available: no Gemini API key is configured." },
      { status: 503 },
    );
  }

  const prompt = `You are an AI assistant helping a user with a system notification in a web application.
Suggest the recommended next steps for this notification. Do not claim that anything has been done or resolved. Keep it under 2 sentences.

Title: ${title}
Message: ${typeof message === "string" ? message : ""}
Details: ${typeof details === "string" && details ? details : "None"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToUse}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );

    if (!response.ok) {
      console.error("Gemini API Error:", response.status, await response.text().catch(() => ""));
      return NextResponse.json({ error: "The AI service didn't answer. Nothing was changed." }, { status: 502 });
    }

    const data = await response.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "The AI service returned no suggestion. Nothing was changed." },
        { status: 502 },
      );
    }

    // `resolution` is kept as the field name for existing callers; it is a suggestion, not an action taken.
    return NextResponse.json({ success: true, kind: "suggestion", resolution: text.trim() });
  } catch (error) {
    console.error("Error in resolve API:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The AI service couldn't be reached. Nothing was changed." }, { status: 502 });
  }
}
