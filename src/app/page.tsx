import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "VSI — ValGrow Search Intelligence | SEO & Generative Engine Optimization (GEO)",
  description:
    "Enterprise search intelligence and AI presence platform. Technical site audits, Google SERP rankings, and real-time citation tracking across Perplexity, ChatGPT Search, and Google AI Overviews.",
  keywords: [
    "VSI",
    "ValGrow Search Intelligence",
    "GEO",
    "Generative Engine Optimization",
    "Technical SEO Audit",
    "AI Search Citations",
    "Perplexity SEO",
    "ChatGPT Search Rankings",
    "Google SERP Tracking",
  ],
  openGraph: {
    title: "VSI — ValGrow Search Intelligence",
    description:
      "Enterprise search intelligence and AI presence platform. Technical site audits, Google SERP rankings, and citation tracking across Perplexity, ChatGPT, and Gemini.",
    type: "website",
    siteName: "VSI AI Suite",
  },
};

export default function Page() {
  return <LandingPage />;
}
