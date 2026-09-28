import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { buildChatContext, type ChatScope } from "@/lib/chat-context";
import { generateAiResponseStream, ChatMessage } from "@/lib/ai-provider";
import { VSI_CHAT_SYSTEM_PROMPT, CONTEXT_UNAVAILABLE } from "@/lib/chat-prompt";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const SYSTEM_BASE_PROMPT = VSI_CHAT_SYSTEM_PROMPT;

export async function POST(req: NextRequest) {
  // 401 signed out, 403 account_disabled / no_organization.
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  try {

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const {
      message,
      conversationId = `conv_${Date.now()}`,
      userId = session?.userId || "user_default",
      workspaceId = session?.agencyId || "ws_default",
      scope = { kind: "global" } as ChatScope,
      messages: incomingMessages,
      stream: requestStream = true,
    } = body;

    // Construct message history
    let messages: ChatMessage[] = [];
    if (Array.isArray(incomingMessages) && incomingMessages.length > 0) {
      messages = incomingMessages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content || "",
      }));
    } else if (message) {
      messages = [{ role: "user", content: String(message) }];
    } else {
      return NextResponse.json({ success: false, error: "Message is required" }, { status: 400 });
    }

    // Build live dataset context from database
    let contextText = "";
    let scopeLabel = "";
    try {
      const ctx = await buildChatContext({ agencyId: session.agencyId, scope });
      contextText = ctx.contextText;
      scopeLabel = ctx.scopeLabel;
    } catch (e) {
      console.warn("[assistant/chat] Context build warning:", e);
      contextText = CONTEXT_UNAVAILABLE;
      scopeLabel = "Unavailable";
    }

    const language = body.language || "English";
    const langInstruction = `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST answer strictly in the following language: ${language} (English, German, Tamil, or Sinhala). All answer text and analysis MUST be in ${language}.`;

    const fullSystemPrompt = `${SYSTEM_BASE_PROMPT}${langInstruction}\n\n=== CURRENT DASHBOARD SCOPE: ${scopeLabel} ===\n${contextText}\n=== END CONTEXT ===`;

    // Handle non-streaming JSON request if requested
    if (requestStream === false || req.headers.get("accept") === "application/json") {
      let fullReply = "";
      let modelUsed = "gemini-2.5-flash";

      const resInfo = await generateAiResponseStream(messages, fullSystemPrompt, {
        onChunk: (chunk) => {
          fullReply += chunk;
        },
      });

      modelUsed = resInfo.modelUsed;

      return NextResponse.json({
        success: true,
        reply: fullReply,
        conversationId,
        userId,
        workspaceId,
        tokens: Math.ceil((fullReply.length + (message ? String(message).length : 0)) / 4),
        model: modelUsed,
        createdAt: new Date().toISOString(),
      });
    }

    // SSE Streaming Response
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          const resInfo = await generateAiResponseStream(messages, fullSystemPrompt, {
            onChunk: (chunk) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
            },
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                conversationId,
                model: resInfo.modelUsed,
                provider: resInfo.providerUsed,
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          console.error("[assistant/chat] Streaming error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "Unable to connect to the AI service. Please try again in a moment.",
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[assistant/chat] Endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to connect to the AI service. Please try again in a moment.",
      },
      { status: 500 }
    );
  }
}
