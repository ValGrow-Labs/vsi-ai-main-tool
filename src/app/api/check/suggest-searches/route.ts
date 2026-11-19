import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { callGemini, callOpenAI } from "@/lib/llm";
import { getDomainAnalysisCache } from "@/lib/domain-cache";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

export interface SuggestedSearchItem {
  query: string;
  category: "step2_topic" | "ai_prompt" | "commercial";
  categoryLabel: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  let body: {
    domain?: string;
    brandName?: string;
    country?: string;
    projectId?: string;
    fresh?: boolean;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request payload." }, { status: 400 });
  }

  const rawDomain = (body.domain || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const brandName = (body.brandName || rawDomain.split(".")[0] || "Business").trim();
  const country = (body.country || "United States").trim();

  if (!rawDomain) {
    return NextResponse.json({ success: false, error: "Domain is required." }, { status: 400 });
  }

  const items: SuggestedSearchItem[] = [];
  const seen = new Set<string>();

  function addSearch(query: string, category: SuggestedSearchItem["category"], label: string) {
    const q = query.trim().replace(/^["']|["']$/g, "");
    const key = q.toLowerCase();
    if (!q || q.length < 3 || seen.has(key)) return;
    seen.add(key);
    items.push({ query: q, category, categoryLabel: label });
  }

  // 1. Try reading project's tracked keywords from Supabase if projectId is provided
  if (body.projectId) {
    try {
      const supabase = await createClient();
      const { data: kwRows } = await supabase
        .from("tracked_keywords")
        .select("keyword, category")
        .eq("client_id", body.projectId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10);

      if (kwRows?.length) {
        for (const k of kwRows) {
          addSearch(k.keyword, "step2_topic", "Tracked Search");
        }
      }
    } catch (e) {
      console.warn("[suggest-searches] supabase read failed:", e);
    }
  }

  // 2. Try reading cached domain analysis from Step 2 / Step 1
  try {
    const cache = await getDomainAnalysisCache(rawDomain);
    if (cache) {
      if (Array.isArray(cache.suggestedTopics)) {
        for (const t of cache.suggestedTopics.slice(0, 5)) {
          addSearch(t, "step2_topic", "Step 2 Topic");
        }
      }
      if (Array.isArray(cache.geoTopics)) {
        for (const g of cache.geoTopics.slice(0, 4)) {
          addSearch(g, "ai_prompt", "AI Overview Prompt");
        }
      }
      if (Array.isArray(cache.suggestedKeywords)) {
        for (const sk of cache.suggestedKeywords.slice(0, 5)) {
          addSearch(sk.keyword, "commercial", "High-Intent Search");
        }
      }
    }
  } catch (e) {
    console.warn("[suggest-searches] cache read failed:", e);
  }

  // 3. If we don't have enough searches (or if fresh requested), generate authentic, high-impact searches via LLM
  if (items.length < 5 || body.fresh) {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey || openaiKey) {
      const systemPrompt = "You are an expert search marketing and generative AI intelligence analyst. Respond strictly in valid JSON format.";
      const prompt = `For the business:
- Brand Name: "${brandName}"
- Website: "${rawDomain}"
- Target Market / Country: "${country}"

Generate the most realistic, high-impact search queries and AI prompts that real buyers, consumers, and users in "${country}" search on Google and ask ChatGPT to find this business or its solutions.

CRITICAL RULES:
1. Every query must be authentic and realistic for users in "${country}".
2. Never invent fake or placeholder queries (do not output "keyword 1" or "example search").
3. Include natural conversational prompts people ask Google AI Overview and ChatGPT.

Return strictly JSON:
{
  "step2Topics": [
    "3-4 core business capabilities and topics (e.g. 'Web scraping API for LLMs', 'Enterprise automation in ${country}')"
  ],
  "aiPrompts": [
    "3-4 questions asked to AI Overviews (e.g. 'What is the best tool to...?')"
  ],
  "commercialSearches": [
    "3-4 commercial or comparison searches typed into Google"
  ]
}`;

      try {
        let content: string | null = null;
        if (geminiKey) {
          const res = await callGemini(systemPrompt, prompt, geminiKey, 800);
          content = res.content;
        } else if (openaiKey) {
          const res = await callOpenAI("gpt-4o-mini", systemPrompt, prompt, openaiKey, 800);
          content = res.content;
        }

        if (content) {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]) as {
              step2Topics?: string[];
              aiPrompts?: string[];
              commercialSearches?: string[];
            };
            if (Array.isArray(parsed.step2Topics)) {
              for (const t of parsed.step2Topics) addSearch(t, "step2_topic", "Step 2 Topic");
            }
            if (Array.isArray(parsed.aiPrompts)) {
              for (const a of parsed.aiPrompts) addSearch(a, "ai_prompt", "AI Overview Prompt");
            }
            if (Array.isArray(parsed.commercialSearches)) {
              for (const c of parsed.commercialSearches) addSearch(c, "commercial", "High-Intent Search");
            }
          }
        }
      } catch (llmErr) {
        console.warn("[suggest-searches] LLM generation error:", llmErr);
      }
    }
  }

  return NextResponse.json({
    success: true,
    domain: rawDomain,
    country,
    searches: items,
  });
}
