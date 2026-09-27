import { ChatScope } from "@/lib/chat-context";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onError?: (err: Error) => void;
  onDone?: () => void;
}

export async function generateAiResponseStream(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks
): Promise<{ providerUsed: string; modelUsed: string }> {
  const provider = (process.env.AI_PROVIDER || "").toUpperCase();

  // Try configured provider first if explicitly specified
  if (provider === "OPENAI" && process.env.OPENAI_API_KEY) {
    try {
      await streamOpenAI(messages, systemPrompt, callbacks);
      return { providerUsed: "OpenAI", modelUsed: "gpt-4o-mini" };
    } catch (e) {
      console.warn("[ai-provider] OpenAI failed, falling back...", e);
    }
  }

  if (provider === "GEMINI" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    try {
      await streamGemini(messages, systemPrompt, callbacks);
      return { providerUsed: "Google Gemini", modelUsed: "gemini-2.5-flash" };
    } catch (e) {
      console.warn("[ai-provider] Gemini failed, falling back...", e);
    }
  }

  if (provider === "ANTHROPIC" && process.env.ANTHROPIC_API_KEY) {
    try {
      await streamAnthropic(messages, systemPrompt, callbacks);
      return { providerUsed: "Anthropic Claude", modelUsed: "claude-3-5-sonnet-20241022" };
    } catch (e) {
      console.warn("[ai-provider] Anthropic failed, falling back...", e);
    }
  }

  if (provider === "OPENROUTER" && process.env.OPENROUTER_API_KEY) {
    try {
      await streamOpenRouter(messages, systemPrompt, callbacks);
      return { providerUsed: "OpenRouter", modelUsed: "openrouter/auto" };
    } catch (e) {
      console.warn("[ai-provider] OpenRouter failed, falling back...", e);
    }
  }

  // Priority Fallback Chain
  // 1. OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      await streamOpenAI(messages, systemPrompt, callbacks);
      return { providerUsed: "OpenAI", modelUsed: "gpt-4o-mini" };
    } catch (e) {
      console.warn("[ai-provider] OpenAI priority attempt failed", e);
    }
  }

  // 2. Google Gemini
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    try {
      await streamGemini(messages, systemPrompt, callbacks);
      return { providerUsed: "Google Gemini", modelUsed: "gemini-2.5-flash" };
    } catch (e) {
      console.warn("[ai-provider] Gemini priority attempt failed", e);
    }
  }

  // 3. Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      await streamAnthropic(messages, systemPrompt, callbacks);
      return { providerUsed: "Anthropic Claude", modelUsed: "claude-3-5-sonnet-20241022" };
    } catch (e) {
      console.warn("[ai-provider] Anthropic priority attempt failed", e);
    }
  }

  // 4. OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await streamOpenRouter(messages, systemPrompt, callbacks);
      return { providerUsed: "OpenRouter", modelUsed: "openrouter/auto" };
    } catch (e) {
      console.warn("[ai-provider] OpenRouter priority attempt failed", e);
    }
  }

  // 5. Intelligent Fallback Engine
  await streamVsiEngineFallback(messages, systemPrompt, callbacks);
  return { providerUsed: "None", modelUsed: "none" };
}

// ----------------------------------------------------------------------
// OpenAI Stream Implementation
// ----------------------------------------------------------------------
async function streamOpenAI(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks
) {
  const apiKey = process.env.OPENAI_API_KEY;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!res.ok || !res.body) throw new Error(`OpenAI HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) callbacks.onChunk(delta);
      } catch {}
    }
  }
}

// ----------------------------------------------------------------------
// Google Gemini Stream Implementation
// ----------------------------------------------------------------------
async function streamGemini(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  const contents = [
    { role: "user", parts: [{ text: `[SYSTEM CONTEXT & INSTRUCTIONS]:\n${systemPrompt}` }] },
    { role: "model", parts: [{ text: "Understood. I am ready to assist as VSI AI Assistant using the provided context." }] },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  ];

  const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-1.5-flash"];

  for (const model of candidateModels) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
          }),
        }
      );
      if (res.ok && res.body) {
        return parseGeminiSSE(res.body, callbacks);
      }
    } catch {
      continue;
    }
  }

  throw new Error("Gemini stream failed across all candidate models");
}

async function parseGeminiSSE(stream: ReadableStream<Uint8Array>, callbacks: StreamCallbacks) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) callbacks.onChunk(text);
      } catch {}
    }
  }
}

// ----------------------------------------------------------------------
// Anthropic Claude Stream Implementation
// ----------------------------------------------------------------------
async function streamAnthropic(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey || "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      system: systemPrompt,
      stream: true,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });

  if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      try {
        const parsed = JSON.parse(payload);
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          callbacks.onChunk(parsed.delta.text);
        }
      } catch {}
    }
  }
}

// ----------------------------------------------------------------------
// OpenRouter Stream Implementation
// ----------------------------------------------------------------------
async function streamOpenRouter(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://searchintel.valgrowlabs.com",
      "X-Title": "VSI Search Intelligence",
    },
    body: JSON.stringify({
      model: "openrouter/auto",
      stream: true,
      temperature: 0.3,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!res.ok || !res.body) throw new Error(`OpenRouter HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) callbacks.onChunk(delta);
      } catch {}
    }
  }
}

// ----------------------------------------------------------------------
// No provider available
// ----------------------------------------------------------------------
// Earlier versions answered here with scripted text containing invented
// metrics. Now the user is told plainly that the chat can't answer.
async function streamVsiEngineFallback(
  _messages: ChatMessage[],
  _systemPrompt: string,
  callbacks: StreamCallbacks
) {
  callbacks.onChunk(
    "The AI chat isn't available right now: no AI provider could answer this request. Your project data is safe. Please try again later, or ask your administrator to check the AI provider settings."
  );
}
