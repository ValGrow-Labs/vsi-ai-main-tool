import type { ReactNode } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  FileText,
  Globe,
  HeartPulse,
  Kanban,
  LineChart,
  Lightbulb,
  Link2,
  ListChecks,
  ListOrdered,
  MessageSquareText,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  Target,
  TrendingUp,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { COMING_SOON_ENGINES, ENGINES } from "@/lib/geo";
import {
  ActionsScene,
  AuditAreaArt,
  AuditFlowScene,
  BoardScene,
  ChatScene,
  CompareScene,
  ReportScene,
  SearchScene,
} from "@/components/illustrations";
import { FeatureIntro, SectionHeading, type Capability, type FlowStep } from "./FeatureIntro";
import { ExampleAudit } from "./SiteAuditIntro";
import { AnswerAnatomy } from "./AnswerAnatomy";
import { CHAT_QUESTIONS, type StoryKey } from "./story";

export type IntroKey = Exclude<StoryKey, never>;

export interface IntroContent {
  page: string;
  category?: string;
  headline: string;
  description: string;
  capabilities?: { title: string; eyebrow?: string; text?: string; items: Capability[]; example?: boolean };
  /** Headline and one line above the steps. */
  flow: { eyebrow?: string; title: string; text: string };
  steps: (string | FlowStep)[];
  stepsTitle?: string;
  /** One true, page-specific line under the steps, next to the CTA. */
  stepsNote: string;
  /** Example questions (AI Chat only). Shown as quotes, never as answers. */
  questions?: string[];
}

/** Engines VSI checks today, read from the same list the product uses. */
export const ENGINE_COVERAGE = {
  live: ENGINES.map((e) => e.label),
  soon: COMING_SOON_ENGINES,
};

export { CHAT_QUESTIONS };

/** All first-use copy in one place. Plain words, no em-dashes, one CTA label. */
export const INTROS: Record<IntroKey, IntroContent> = {
  audit: {
    page: "Site Audit",
    headline: "Find problems that could be hurting your website.",
    description: "VSI checks your website and shows you what needs attention, in plain language, with what to do about each problem.",
    capabilities: {
      eyebrow: "What we check",
      title: "A complete look at what matters",
      text: "VSI checks the areas that decide whether people, search engines and AI systems can use your website.",
      items: [
        { Icon: HeartPulse, title: "Website health", text: "Make sure visitors can use your website easily.", detail: "Secure connection, pages that fail to load, broken links, mobile layout" },
        { Icon: Search, title: "Search readiness", text: "Help search engines understand your pages.", detail: "Pages search engines may show, sitemap, page titles, page descriptions" },
        { Icon: MessageSquareText, title: "AI readiness", text: "Help AI systems understand and use your content.", detail: "AI crawlers allowed, business details, answer-style content" },
        { Icon: FileText, title: "Content", text: "Find pages that could explain things more clearly.", detail: "Page headings and image descriptions" },
      ],
    },
    flow: {
      eyebrow: "What you'll get",
      title: "From your website to clear actions",
      text: "VSI checks your website in a few simple steps and shows you exactly what to fix.",
    },
    steps: [
      { Icon: Globe, title: "Your website", text: "You add it once." },
      { Icon: ScanSearch, title: "VSI checks it", text: "Your homepage and up to 9 more pages." },
      { Icon: MessageSquareText, title: "Problems explained", text: "In plain language, without jargon." },
      { Icon: ListChecks, title: "Clear actions", text: "What to do about each problem." },
    ],
    stepsNote: "The site audit is free. It runs as soon as you add your website.",
  },
  search: {
    page: "Search Visibility",
    headline: "See where your website appears in search.",
    description: "Track important searches and understand what is improving, dropping, and worth your attention.",
    capabilities: {
      title: "What you can track",
      items: [
        { Icon: ListOrdered, title: "Search rankings", text: "Track where your pages appear for each search." },
        { Icon: ArrowUpDown, title: "Ranking changes", text: "See what improved or dropped since the last check." },
        { Icon: Target, title: "Important searches", text: "Focus on the searches that matter to your business." },
      ],
    },
    flow: { title: "From a list of searches to clear priorities", text: "Tell VSI which searches matter. It checks where you appear and shows what changed." },
    steps: ["Add searches", "VSI checks", "See changes", "Act on what matters"],
    stepsNote: "One list of searches powers both Search Visibility and AI Visibility.",
  },
  ai: {
    page: "AI Visibility",
    headline: "See how your website appears in AI answers.",
    description: "Track mentions, citations, competitors, and visibility across AI search experiences.",
    capabilities: {
      title: "What you'll discover",
      items: [
        { Icon: MessageSquareText, title: "AI mentions", text: "See when your business appears in an AI answer." },
        { Icon: Link2, title: "AI citations", text: "See when an AI answer links to your website as a source." },
        { Icon: Users, title: "Competitor presence", text: "See when competitors appear instead of you." },
        { Icon: Lightbulb, title: "Opportunities", text: "Find searches where your business could be more visible." },
      ],
    },
    flow: { title: "From your searches to real AI answers", text: "VSI asks AI services the questions your customers ask, and shows you who they mention." },
    steps: ["Add searches", "VSI checks AI answers", "Measure mentions and citations", "Act on opportunities"],
    stepsNote: "Search and AI checks run together, and only when you start them.",
  },
  competitors: {
    page: "Competitors",
    headline: "See where competitors appear, and where you can win.",
    description: "Compare your business with the competitors your customers are already considering, in Google and in AI answers.",
    capabilities: {
      title: "What you can see",
      items: [
        { Icon: Search, title: "Search visibility", text: "Who shows up on Google for your searches." },
        { Icon: MessageSquareText, title: "AI visibility", text: "Who AI answers mention or link to." },
        { Icon: Lightbulb, title: "Content opportunities", text: "Searches where a competitor appears and you don't." },
      ],
    },
    flow: { title: "From competitor names to clear gaps", text: "Add the competitors you care about. VSI shows where they appear and you do not." },
    steps: ["Add competitors", "VSI compares visibility", "Find the gaps", "Turn gaps into actions"],
    stepsNote: "Add competitors while setting up your website, or here any time later.",
  },
  actions: {
    page: "Next Actions",
    headline: "Know what to work on next.",
    description: "VSI turns website, search and AI findings into clear actions you can take, most important first.",
    capabilities: {
      title: "What actions look like",
      example: true,
      items: [
        { Icon: Wrench, title: "Fix website issues", text: "Some pages link to addresses that no longer exist." },
        { Icon: FileText, title: "Improve important pages", text: "A key page doesn't answer the question customers ask." },
        { Icon: MessageSquareText, title: "Strengthen AI visibility", text: "AI answers for a search link to a competitor, not to you." },
        { Icon: TrendingUp, title: "Improve search visibility", text: "A search is close to Google's first page." },
      ],
    },
    flow: { title: "From a finding to finished work", text: "Every action starts with something VSI found on your website, in search or in AI answers." },
    stepsTitle: "How an action is made",
    steps: ["VSI finds something", "Explains why it matters", "Recommends what to do", "You create a task", "Track progress"],
    stepsNote: "Every action can become a task for your team in one step.",
  },
  tasks: {
    page: "Tasks",
    headline: "Turn recommendations into work your team can finish.",
    description: "Create tasks from VSI findings and keep track of what has been completed.",
    capabilities: {
      title: "What you can do",
      items: [
        { Icon: Plus, title: "Create tasks", text: "Turn any finding into a task in one step." },
        { Icon: UserRound, title: "Assign work", text: "Give each task an owner: writer, developer, SEO or outreach." },
        { Icon: Kanban, title: "Track progress", text: "Move tasks from to do, to in progress, to done." },
        { Icon: CheckCircle2, title: "Mark completed", text: "Record when the work is finished." },
        { Icon: RefreshCw, title: "Verify improvements", text: "VSI checks again and tells you whether it worked." },
      ],
    },
    flow: { title: "From a recommendation to a checked result", text: "Work moves from a finding to a task, and VSI checks again when it is done." },
    steps: ["Open a finding", "Create a task", "Do the work", "VSI checks the result"],
    stepsNote: "When a task is done, VSI checks again and shows whether it worked.",
  },
  reports: {
    page: "Reports",
    headline: "Understand your progress over time.",
    description: "Bring your website, search and AI visibility together in clear reports you can share.",
    capabilities: {
      title: "What reports show",
      items: [
        { Icon: HeartPulse, title: "Website health", text: "Your latest site audit score and how it changed." },
        { Icon: Search, title: "Search visibility", text: "Searches that moved up or down on Google." },
        { Icon: MessageSquareText, title: "AI visibility", text: "Searches where AI answers started or stopped citing you." },
        { Icon: Users, title: "Competitor insights", text: "Searches where competitors appear and you don't." },
        { Icon: CheckCircle2, title: "Completed actions", text: "Tasks your team finished in the period." },
        { Icon: LineChart, title: "Progress over time", text: "Each report compares this period with the one before." },
      ],
    },
    flow: { title: "From your checks to a report you can share", text: "Reports are built from the checks you have already run. Nothing is estimated." },
    steps: ["Add your website", "Run your checks", "Create a report", "Share the link"],
    stepsNote: "Each report has its own link you can share.",
  },
  chat: {
    page: "AI Chat",
    headline: "Ask questions about your website and visibility.",
    description: "Ask VSI about your website, search visibility, AI visibility, competitors and recommended actions.",
    questions: CHAT_QUESTIONS,
    flow: { title: "From a question to an answer with evidence", text: "VSI answers from your own checks and shows what each answer is based on." },
    steps: ["Add your website", "Run your first checks", "Ask a question", "Get answers from your own data"],
    stepsNote: "Answers come only from your own website's data.",
  },
};

const ILLUSTRATIONS: Record<IntroKey, () => ReactNode> = {
  audit: () => <AuditFlowScene />,
  search: () => <SearchScene />,
  ai: () => <AnswerAnatomy framed={false} />,
  competitors: () => <CompareScene />,
  actions: () => <ActionsScene />,
  tasks: () => <BoardScene />,
  reports: () => <ReportScene />,
  chat: () => <ChatScene />,
};

export function introIllustration(key: IntroKey): ReactNode {
  return ILLUSTRATIONS[key]();
}

function EngineNote() {
  return (
    <p>
      Checked today in {ENGINE_COVERAGE.live.join(", ")}. Coming soon: {ENGINE_COVERAGE.soon.join(" and ")}.
    </p>
  );
}

function ExampleQuestions({ questions }: { questions: string[] }) {
  return (
    <section className="space-y-6">
      <SectionHeading eyebrow="Examples" title="Questions you can ask" />
      <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
        {questions.map((q) => (
          <li key={q} className="border-l-2 border-line-strong pl-4 text-body text-ink-2">
            &ldquo;{q}&rdquo;
          </li>
        ))}
      </ul>
      <p className="text-support text-ink-3">Add your website first, so VSI can answer questions about it from your own data.</p>
    </section>
  );
}

/** The complete first-use page for one feature. */
export function Intro({ name }: { name: IntroKey }) {
  const c = INTROS[name];
  const audit = name === "audit";
  const areas = ["health", "search", "ai", "content"] as const;
  const capabilities = c.capabilities && {
    ...c.capabilities,
    items: audit ? c.capabilities.items.map((item, i) => ({ ...item, art: <AuditAreaArt area={areas[i]} /> })) : c.capabilities.items,
    note: name === "ai" ? <EngineNote /> : undefined,
  };
  return (
    <FeatureIntro
      page={c.page}
      category={c.category}
      headline={c.headline}
      description={c.description}
      illustration={introIllustration(name)}
      capabilities={capabilities}
      middle={c.questions ? <ExampleQuestions questions={c.questions} /> : audit ? <ExampleAudit /> : undefined}
      flow={c.flow}
      closing={audit ? { title: "Ready to see what VSI finds?", text: "Add your website and start with a Site Audit." } : undefined}
      storyTitle={audit ? "Why Site Audit comes first" : undefined}
      storyText={
        audit
          ? "Before tracking rankings or AI visibility, VSI needs to understand whether your website is technically healthy and easy for search engines and AI systems to understand."
          : undefined
      }
      steps={c.steps}
      stepsTitle={c.stepsTitle}
      stepsNote={c.stepsNote}
      story={name}
    />
  );
}
