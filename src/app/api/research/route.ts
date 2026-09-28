import { NextRequest, NextResponse } from "next/server";
import { searchSerpApi } from "@/lib/serpapi-service";
import { requireAgencyApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ResearchRequestBody {
  keyword?: string;
  language?: string;
  location?: string;
  service?: string;
}

const GL_MAP: Record<string, string> = {
  "India": "in",
  "in": "in",
  "United States": "us",
  "US": "us",
  "us": "us",
  "United Kingdom": "uk",
  "UK": "uk",
  "uk": "uk",
  "Canada": "ca",
  "ca": "ca",
  "Australia": "au",
  "au": "au",
  "Germany": "de",
  "de": "de",
  "Singapore": "sg",
  "sg": "sg",
  "Sri Lanka": "lk",
  "lk": "lk",
  "UAE": "ae",
  "United Arab Emirates": "ae",
  "ae": "ae",
};

const HL_MAP: Record<string, string> = {
  "English": "en",
  "German": "de",
  "Tamil": "ta",
  "Sinhala": "si",
};

interface LocalizedItem {
  searchesDesc: (loc: string) => string;
  difficultyDesc: string;
  aiVisibilityDesc: string;
  intents: Record<string, { primary: string; desc: string }>;
  getPrompts: (kw: string, loc: string, intent: string) => string[];
  aiOverview: (kw: string, loc: string) => string;
}

const LOCALIZED_CONTENT: Record<string, LocalizedItem> = {
  German: {
    searchesDesc: (loc) => `Geschätzte monatliche Suchanfragen in ${loc}`,
    difficultyDesc: "Google SERP-Wettbewerbsniveau",
    aiVisibilityDesc: "Wahrscheinlichkeit der Einbindung in die KI-Suche",
    intents: {
      Commercial: {
        primary: "Kommerziell",
        desc: "Benutzer vergleichen Optionen oder Dienstleister",
      },
      Transactional: {
        primary: "Transaktionsorientiert",
        desc: "Suchende sind bereit zu kaufen oder einen Kauf zu tätigen",
      },
      Navigational: {
        primary: "Navigationsorientiert",
        desc: "Benutzer suchen nach einer bestimmten Marke oder Website",
      },
      Informational: {
        primary: "Informationsorientiert",
        desc: "Suchende möchten Informationen lernen oder lesen",
      },
    },
    getPrompts: (kw, loc, intent) => {
      if (intent === "Commercial") {
        return [
          `Beste ${kw} für Unternehmen in ${loc}`,
          `Top-bewertete ${kw}-Anbieter und Preisübersicht`,
          `Wie man die besten ${kw} bewertet und auswählt`,
          `Welches ${kw} bietet laut KI-Suche den höchsten ROI?`,
        ];
      } else if (intent === "Transactional") {
        return [
          `Wo kann man ${kw} in ${loc} kaufen oder bestellen`,
          `Beste Preise und Pakete für ${kw}`,
          `Lohnt sich der Kauf von ${kw}? KI-Preisvergleich`,
          `Top-Angebote und zuverlässige Lieferanten für ${kw}`,
        ];
      } else if (intent === "Navigational") {
        return [
          `Was ist die offizielle Website und Hauptdienste von ${kw}?`,
          `Ist ${kw} zuverlässig? KI-Bewertung`,
          `${kw} Kundenbewertungen und Markenimage`,
          `Beste Alternativen zu ${kw} in ${loc}`,
        ];
      } else {
        return [
          `Was ist ${kw} und wie funktioniert es?`,
          `Vollständiger Leitfaden zu ${kw} in ${loc}`,
          `Die 5 wichtigsten Dinge über ${kw} laut KI`,
          `Beste Strategien für ${kw} im Jahr 2026`,
        ];
      }
    },
    aiOverview: (kw, loc) =>
      `KI-Übersicht für "${kw}" in ${loc}: Hohe KI-Suchabsicht identifiziert. Suchmaschinen-LLMs (Google AI Overview, ChatGPT) priorisieren strukturelle Autorität und strukturierte Daten für dieses Schlüsselwort.`,
  },
  Tamil: {
    searchesDesc: (loc) => `${loc}-இல் மதிப்பிடப்பட்ட மாதாந்திர தேடல்கள்`,
    difficultyDesc: "Google SERP போட்டியின் நிலை",
    aiVisibilityDesc: "AI தேடல் சேர்க்கைக்கான சாத்தியக்கூறு",
    intents: {
      Commercial: {
        primary: "வணிக நோக்கம் (Commercial)",
        desc: "பயனர்கள் விருப்பங்கள் அல்லது சேவை வழங்குநர்களை ஒப்பிடுகிறார்கள்",
      },
      Transactional: {
        primary: "பரிவர்த்தனை நோக்கம் (Transactional)",
        desc: "தேடுபவர்கள் பொருள் அல்லது சேவையை வாங்கத் தயாராக உள்ளனர்",
      },
      Navigational: {
        primary: "வழிசெலுத்தல் நோக்கம் (Navigational)",
        desc: "பயனர்கள் குறிப்பிட்ட பிராண்ட் அல்லது தளத்தைத் தேடுகிறார்கள்",
      },
      Informational: {
        primary: "தகவல் நோக்கம் (Informational)",
        desc: "தேடுபவர்கள் தகவல்களை அறிய விரும்புவார்கள்",
      },
    },
    getPrompts: (kw, loc, intent) => {
      if (intent === "Commercial") {
        return [
          `${loc}-இல் உள்ள நிறுவனங்களுக்கான சிறந்த ${kw}`,
          `சிறந்த ${kw} வழங்குநர்கள் மற்றும் விலை விவரம்`,
          `${kw}-ஐ எவ்வாறு மதிப்பீடு செய்து தேர்வு செய்வது`,
          `AI தேடலின் படி எந்த ${kw} அதிக ROI தருகிறது?`,
        ];
      } else if (intent === "Transactional") {
        return [
          `${loc}-இல் ${kw} எங்கு வாங்குவது அல்லது ஆர்டர் செய்வது`,
          `${kw}-க்கான சிறந்த விலை மற்றும் பாக்கெஜ்கள்`,
          `${kw} வாங்க தகுதியானதா? AI விலை ஒப்பீடு`,
          `${kw}-க்கான சிறந்த சலுகைகள் மற்றும் நம்பகமான விற்பனையாளர்கள்`,
        ];
      } else if (intent === "Navigational") {
        return [
          `${kw} அதிகாரப்பூர்வ தளம் மற்றும் முக்கிய சேவைகள் என்ன?`,
          `${kw} நம்பகமானதா? AI பிராண்ட் விமர்சனம்`,
          `${kw} வாடிக்கையாளர் விமர்சனங்கள் மற்றும் கருத்துக்கள்`,
          `${loc}-இல் ${kw}-க்கான சிறந்த மாற்று தளங்கள்`,
        ];
      } else {
        return [
          `${kw} என்றால் என்ன, அது எவ்வாறு செயல்படுகிறது?`,
          `${loc}-இல் ${kw} பற்றிய முழுமையான வழிகாட்டி`,
          `AI வழங்கும் ${kw} பற்றிய 5 முக்கிய தகவல்கள்`,
          `2026-இல் ${kw}-க்கான சிறந்த உத்திகள்`,
        ];
      }
    },
    aiOverview: (kw, loc) =>
      `"${kw}"க்கான AI சுருக்கம் (${loc}): அதிக AI தேடல் நோக்கம் கண்டறியப்பட்டுள்ளது. தேடுபொறி LLM-கள் (Google AI Overview, ChatGPT) இந்த முக்கிய சொல்லுக்கு கட்டமைக்கப்பட்ட அதிகாரம் மற்றும் Schema தரவுகளுக்கு முன்னுரிமை அளிக்கின்றன.`,
  },
  Sinhala: {
    searchesDesc: (loc) => `${loc} හි ඇස්තමේන්තුගත මාසික සෙවුම්`,
    difficultyDesc: "Google SERP තරඟකාරී මට්ටම",
    aiVisibilityDesc: "AI සෙවුම් ඇතුළත් කිරීමේ සම්භාවිතාව",
    intents: {
      Commercial: {
        primary: "වාණිජමය (Commercial)",
        desc: "පරිශීලකයින් සේවා සපයන්නන් සංසන්දනය කරයි",
      },
      Transactional: {
        primary: "ගනුදෙනුමය (Transactional)",
        desc: "සොයන්නන් මිලදී ගැනීමට සූදානම්",
      },
      Navigational: {
        primary: "දිශානතිමය (Navigational)",
        desc: "පරිශීලකයින් නිශ්චිත වෙබ් අඩවියක් සොයයි",
      },
      Informational: {
        primary: "තොරතුරුමය (Informational)",
        desc: "සොයන්නන් තොරතුරු දැන ගැනීමට හෝ කියවීමට කැමතියි",
      },
    },
    getPrompts: (kw, loc, intent) => {
      if (intent === "Commercial") {
        return [
          `${loc} හි ව්‍යාපාර සඳහා හොඳම ${kw}`,
          `ඉහළම ශ්‍රේණිගත ${kw} සපයන්නන් සහ මිල ගණන්`,
          `හොඳම ${kw} ඇගයීම සහ තෝරා ගන්නේ කෙසේද`,
          `AI සෙවුමට අනුව වැඩිම ROI ලබා දෙන්නේ කුමන ${kw} ද?`,
        ];
      } else if (intent === "Transactional") {
        return [
          `${loc} හි ${kw} මිලදී ගැනීමට හෝ ඇණවුම් කිරීමට ස්ථාන`,
          `${kw} සඳහා හොඳම මිල ගණන් සහ පැකේජ`,
          `${kw} මිලදී ගැනීම වටී ද? AI පිරිවැය සංසන්දනය`,
          `${kw} සඳහා ඉහළම ගනුදෙනු සහ විශ්වාසදායක සැපයුම්කරුවන්`,
        ];
      } else if (intent === "Navigational") {
        return [
          `${kw} නිල වෙබ් අඩවිය සහ ප්‍රධාන සේවාවන් මොනවාද?`,
          `${kw} විශ්වාසදායකද? AI සමාලෝචනය`,
          `${kw} පාරිභෝගික සමාලෝචන`,
          `${loc} හි ${kw} සඳහා හොඳම විකල්ප`,
        ];
      } else {
        return [
          `${kw} යනු කුමක්ද සහ එය ක්‍රියා කරන්නේ කෙසේද?`,
          `${loc} හි ${kw} පිළිබඳ සම්පූර්ණ මාර්ගෝපදේශය`,
          `AI අනුව ${kw} පිළිබඳ දැනගත යුතු ප්‍රධාන කරුණු 5`,
          `2026 දී ${kw} සඳහා හොඳම උපාය මාර්ග`,
        ];
      }
    },
    aiOverview: (kw, loc) =>
      `${loc} හි "${kw}" සඳහා AI දළ විශ්ලේෂණය: ඉහළ AI සෙවුම් අභිප්‍රායක් හඳුනාගෙන ඇත. සෙවුම් යන්ත්‍ර LLM (Google AI Overview, ChatGPT) මෙම මූල පදය සඳහා ව්‍යුහගත අධිකාරිය සහ ක්‍රමානුකූල දත්ත වලට ප්‍රමුඛතාවය දෙයි.`,
  },
  English: {
    searchesDesc: (loc) => `Estimated monthly searches in ${loc}`,
    difficultyDesc: "Google SERP competition level",
    aiVisibilityDesc: "AI search inclusion trigger probability",
    intents: {
      Commercial: {
        primary: "Commercial",
        desc: "Users comparing options or service providers",
      },
      Transactional: {
        primary: "Transactional",
        desc: "Searchers are ready to buy or make a purchase",
      },
      Navigational: {
        primary: "Navigational",
        desc: "Users looking for a specific brand or site",
      },
      Informational: {
        primary: "Informational",
        desc: "People searching want to learn or read info",
      },
    },
    getPrompts: (kw, loc, intent) => {
      if (intent === "Commercial") {
        return [
          `best ${kw} for businesses in ${loc}`,
          `top rated ${kw} providers and pricing breakdown`,
          `how to evaluate and hire the best ${kw}`,
          `which ${kw} offers the highest ROI according to AI search?`,
        ];
      } else if (intent === "Transactional") {
        return [
          `where to buy or order ${kw} in ${loc}`,
          `best pricing and packages for ${kw}`,
          `is ${kw} worth buying? AI cost comparison`,
          `top deals and trustworthy suppliers for ${kw}`,
        ];
      } else if (intent === "Navigational") {
        return [
          `what is ${kw} official site and core services?`,
          `is ${kw} legit and reliable? AI reputation review`,
          `${kw} customer reviews and brand sentiment`,
          `top alternatives to ${kw} in ${loc}`,
        ];
      } else {
        return [
          `what is ${kw} and how does it work?`,
          `complete guide to ${kw} in ${loc}`,
          `top 5 things to know about ${kw} according to AI`,
          `best strategies for ${kw} in 2026`,
        ];
      }
    },
    aiOverview: (kw, loc) =>
      `AI Overview for "${kw}" in ${loc}: High AI search intent identified. Search engine LLMs (Google AI Overview, ChatGPT) prioritize structural authority and structured schema for this keyword.`,
  },
};

export async function POST(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  try {
    const body = (await req.json()) as ResearchRequestBody;
    const keyword = body.keyword?.trim();
    const location = body.location || "India";
    const language = body.language || "English";

    if (!keyword) {
      return NextResponse.json({ success: false, error: "Enter a search to look up." }, { status: 400 });
    }

    const gl = GL_MAP[location] || "in";
    const hl = HL_MAP[language] || "en";

    // Live Google results. Only real data is returned: no estimated volumes,
    // difficulty scores or AI percentages.
    let organicResults: { position?: number; title: string; link: string; snippet?: string }[] = [];
    let knowledgeGraph = false;
    let serpError: string | null = null;
    let isDemo = false;
    try {
      const serpData = await searchSerpApi(keyword, { engine: "google", gl, hl, num: 10 });
      // Development placeholder data is never shown as live results.
      organicResults = serpData?.isDemo ? [] : serpData?.results ?? [];
      knowledgeGraph = serpData?.isDemo ? false : Boolean(serpData?.knowledge_graph);
      if (serpData?.isDemo) isDemo = true;
    } catch (err: unknown) {
      console.error("[research] live results failed", err instanceof Error ? err.message : err);
      serpError = "Live results aren't available right now.";
    }


    // Likely intent: a rule-based reading of the words, shown as an estimate.
    const kwLower = keyword.toLowerCase();
    let rawIntent = "Informational";
    if (/(buy|price|cost|pricing|cheap|discount|order|deal|shop|store)/.test(kwLower)) {
      rawIntent = "Transactional";
    } else if (/(best|top|vs|compare|review|agency|company|services|provider|firm)/.test(kwLower)) {
      rawIntent = "Commercial";
    } else if (knowledgeGraph || /(official|login|website|portal|app)/.test(kwLower)) {
      rawIntent = "Navigational";
    }
    const localized = LOCALIZED_CONTENT[language] || LOCALIZED_CONTENT.English;
    const intentObj = localized.intents[rawIntent] || localized.intents.Informational;

    return NextResponse.json({
      success: true,
      keyword,
      location,
      language,
      liveResultsAvailable: !isDemo && !serpError,
      liveResultsNote: isDemo ? "Live results need a search provider key, which isn't set up in this environment." : serpError,
      intent: { primary: intentObj.primary, description: intentObj.desc },
      prompts: localized.getPrompts(keyword, location, rawIntent).slice(0, 4),
      topOrganicResults: organicResults.slice(0, 10),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }
    console.error("[research] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Something went wrong while looking up this search." }, { status: 500 });
  }
}
