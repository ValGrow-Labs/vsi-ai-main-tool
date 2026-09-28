# AI Visibility Dashboard — Technical API Documentation

> **Version:** 1.0 | **Last Updated:** February 24, 2026  
> **Stack:** PHP 8+ backend, Vanilla JS frontend, JSON flat-file storage

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [External APIs Used](#2-external-apis-used)
3. [Internal API Endpoints](#3-internal-api-endpoints)
4. [Data Flow & Processing Pipeline](#4-data-flow--processing-pipeline)
5. [Data Storage Schema](#5-data-storage-schema)
6. [Authentication & Access Control](#6-authentication--access-control)
7. [Calculations & Metrics](#7-calculations--metrics)
8. [Environment & Configuration](#8-environment--configuration)

---

## 1. Architecture Overview

```
┌────────────────────────────┐
│     Browser (Frontend)     │
│  index.html / dashboard.js │
│  api-client.js             │
└──────────┬─────────────────┘
           │  fetch() calls
           ▼
┌────────────────────────────┐
│   php/api.php (Router)     │
│   • auth.php               │
│   • config.php             │
└──────────┬─────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌──────────┐ ┌──────────────┐
│  JSON    │ │ External APIs│
│  Files   │ │ (SerpAPI,    │
│ (data/)  │ │  OpenAI)     │
└──────────┘ └──────────────┘
```

**Key Files:**

| File | Role |
|------|------|
| `php/config.php` | App-wide constants, JSON read/write helpers, CORS headers |
| `php/auth.php` | Session-based auth, user CRUD, role checks |
| `php/api.php` | Main API router — all frontend calls go here |
| `php/serpapi_service.php` | Google AI Overview scanning via SerpAPI |
| `php/openai_service.php` | ChatGPT brand mention scanning via OpenAI API |
| `js/api-client.js` | Frontend fetch wrappers for all API actions |
| `js/dashboard.js` | UI controller — renders data, handles modals & navigation |
| `js/calculations.js` | Metric computation (Share of Mention, Sentiment, Win/Loss, etc.) |

---

## 2. External APIs Used

### 2.1 SerpAPI (Google AI Overview)

| Detail | Value |
|--------|-------|
| **Purpose** | Detect if a brand is mentioned in Google's AI Overview for a given query |
| **API Endpoint** | `https://serpapi.com/search.json` |
| **Engine** | `google` (standard), then follows `serpapi_link` for detailed AI Overview |
| **Auth** | API key passed as query parameter `api_key=` |
| **PHP File** | `php/serpapi_service.php` → `scanWithSerpAPI()` |

**How it works (2-step process):**

1. **Step 1 — Standard Google Search:**

   ```
   GET https://serpapi.com/search.json
     ?engine=google
     &q={URL-encoded query}
     &api_key={SERPAPI_KEY}
     &location={United+States | United+Arab+Emirates}
     &gl={us | ae}
     &hl=en
   ```
   
   - Returns standard Google results plus an `ai_overview` object (if available).
   - The `ai_overview` object contains a `serpapi_link` for a more detailed fetch.

2. **Step 2 — Detailed AI Overview Fetch:**

   ```
   GET {ai_overview.serpapi_link}&api_key={SERPAPI_KEY}
   ```
   
   - Returns the full AI Overview content with `text_blocks` and `references`.
   - If the `serpapi_link` is not present, falls back to the initial `ai_overview` data.

**Parameters handled in code:**

| Parameter | Description | Values |
|-----------|-------------|--------|
| `$prompt` | The search query to scan | Any string |
| `$apiKey` | SerpAPI key from `.env` | String |
| `$brandName` | Brand to check for mentions | e.g. `"ExampleClient"` |
| `$location` | Target market | `"us"` → United States, `"ae"` → UAE |

**Response parsing logic:**

- **AI Overview Text** is extracted from `text_blocks[]` which can be of type:
  - `paragraph` → `snippet` field
  - `heading` → `snippet` field
  - `list` → nested `list[]` items, each with `snippet` or nested `text_blocks`
- **Fallback:** If `text_blocks` is absent, falls back to `text_content` field.
- **Citations/References** are extracted from `ai_overview.references[]`, each containing:
  - `title`, `link`, `snippet`, `source`
  - Domain is parsed from the link URL for competitor tracking.
- **Brand Detection:** Case-insensitive `stripos()` search of the brand name against the full extracted AI text.
- **Sentiment:** Simple keyword-based:
  - If brand mentioned + text contains "best", "top", or "leading" → `positive`
  - If brand mentioned without those keywords → `neutral`
  - If brand not mentioned → `negative`

**Return object:**

```json
{
  "response_text": "<HTML formatted AI Overview>",
  "brand_mentioned": true,
  "sentiment": "positive",
  "competitors_mentioned": ["competitor1.com", "competitor2.com"],
  "citations": [
    {
      "title": "Article Title",
      "link": "https://...",
      "snippet": "...",
      "source": "Source Name",
      "domain": "example.com",
      "is_brand_mention": false
    }
  ]
}
```

---

### 2.2 OpenAI API (ChatGPT Check)

| Detail | Value |
|--------|-------|
| **Purpose** | Check if ChatGPT mentions the brand when answering a query |
| **API Endpoint** | `https://api.openai.com/v1/chat/completions` |
| **Model** | `gpt-4o` |
| **Auth** | Bearer token header: `Authorization: Bearer {OPENAI_API_KEY}` |
| **PHP File** | `php/openai_service.php` → `scanPromptWithOpenAI()` |

**How it works:**

1. Sends a `POST` request to OpenAI's Chat Completions endpoint.
2. **System message** instructs the model to answer the query and check for brand mentions.
3. **User prompt** asks for:
   - A comprehensive HTML-formatted answer.
   - Whether the brand is mentioned (`true`/`false`).
   - Sentiment classification (`positive`/`neutral`/`negative`).
4. Uses `response_format: { type: "json_object" }` to enforce strict JSON output.

**Request body:**

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful AI assistant. You will answer the user's query and check for specific brand mentions. You must return your response in valid JSON format."
    },
    {
      "role": "user",
      "content": "Query: \"...\"\n\n1. Provide a comprehensive answer...\n2. Check if brand \"ExampleClient\" is mentioned...\n3. Return JSON: {response_text, brand_mentioned, sentiment}"
    }
  ],
  "temperature": 0.7,
  "response_format": { "type": "json_object" }
}
```

**Return object:**

```json
{
  "response_text": "<HTML formatted answer>",
  "brand_mentioned": false,
  "sentiment": "neutral",
  "citations": []
}
```

> **Note:** Standard ChatGPT API does not provide web citations. The `citations` array is always empty unless browsing/retrieval is enabled.

---

## 3. Internal API Endpoints

All internal API requests go through a single router: `php/api.php?action={action_name}`

### 3.1 Authentication (Public — No Auth Required)

| Action | Method | Description |
|--------|--------|-------------|
| `login` | `POST` | Authenticate user with email & password |
| `logout` | `GET` | Destroy session |
| `get_session` | `GET` | Check if currently authenticated |

**Login request body:**

```json
{ "email": "admin@example.com", "password": "password123" }
```

**Login response:**

```json
{
  "status": "success",
  "user": {
    "id": "u001", "email": "...", "name": "...",
    "role": "admin|client", "company": "...",
    "created_at": "...", "status": "active"
  }
}
```

---

### 3.2 Data Endpoints (Authenticated Users)

| Action | Method | Query Params | Description |
|--------|--------|-------------|-------------|
| `get_data` | `GET` | `type` (optional) | Get all dashboard data or specific type |
| `get_ai_queries` | `GET` | `client_id` (admin only) | Get AI queries filtered by role |
| `run_ai_query_check` | `POST` | — | Run a live scan (SerpAPI + OpenAI) for one query |
| `export` | `GET` | `format=csv` | Export queries as CSV |

**`get_data` returns (when no `type` param):**

```json
{
  "responses": [...],
  "schema": [...],
  "aiQueries": [...]
}
```

**`get_ai_queries` filtering logic:**

- **Admin:** Returns all queries. If `client_id` param is provided, filters to that client.
- **Client:** Returns only queries where `client_id === current_user_id`.

**`run_ai_query_check` request:**

```json
{ "id": "q001" }
```

This triggers:
1. SerpAPI scan → Google AI Overview result
2. OpenAI scan → ChatGPT result
3. Updates the query in `ai_queries.json` with `latest_result`, `last_checked`, and `status`

**`run_ai_query_check` stored result structure:**

```json
{
  "id": "q001",
  "query": "generative ai solutions for enterprises",
  "brand_name": "ExampleClient",
  "location": "us",
  "client_id": "u008",
  "status": "Checked",
  "last_checked": "2026-02-24 12:00:00",
  "latest_result": {
    "timestamp": "2026-02-24 12:00:00",
    "google": {
      "response_text": "<HTML>",
      "brand_mentioned": true,
      "sentiment": "positive",
      "competitors_mentioned": ["competitor.com"],
      "citations": [...]
    },
    "chatgpt": {
      "response_text": "<HTML>",
      "brand_mentioned": false,
      "sentiment": "neutral",
      "citations": []
    }
  }
}
```

---

### 3.3 Admin-Only Endpoints

| Action | Method | Description |
|--------|--------|-------------|
| `save_ai_query` | `POST` | Create or update an AI query |
| `delete_ai_query` | `POST` | Delete a query by ID |
| `run_scan` | `POST` | Run a one-off manual scan (not saved to queries) |
| `create_user` | `POST` | Create a new client account |
| `list_users` | `GET` | List all user accounts |
| `delete_user` | `POST` | Delete a user and their associated queries |
| `update_user` | `POST` | Update user details |
| `get_settings` | `GET` | Get current API key settings (masked) |
| `save_settings` | `POST` | Save API keys and brand name to `.env` |

**`save_ai_query` request (new query):**

```json
{
  "query": "ai strategy consulting",
  "brand_name": "ExampleClient",
  "location": "us",
  "client_id": "u008"
}
```

Auto-generates: `id`, `created_at`, `status: "Pending"`, `last_checked: null`.

**`create_user` request:**

```json
{
  "email": "admin@example.com",
  "password": "SecurePass123!",
  "name": "ExampleClient",
  "role": "client",
  "company": "ExampleClient"
}
```

---

## 4. Data Flow & Processing Pipeline

### 4.1 Adding a New Client + Queries

```
Admin Dashboard → "Add Client" Modal
  │
  ├─ POST api.php?action=create_user
  │   → Hashes password with password_hash()
  │   → Auto-generates user ID (u001, u002, ...)
  │   → Saves to data/users.json
  │
  └─ POST api.php?action=save_ai_query (×N queries)
      → Auto-generates query ID (q001, q002, ...)
      → Sets client_id, brand_name, location
      → Saves to data/ai_queries.json
```

### 4.2 Running an AI Visibility Check

```
Dashboard → Click "Check" button on a query
  │
  POST api.php?action=run_ai_query_check  { id: "q001" }
  │
  ├── 1. Load API keys from credentials/.env
  │
  ├── 2. SerpAPI Check (Google AI Overview)
  │   ├── Step 1: GET serpapi.com/search.json?q=...
  │   ├── Step 2: GET {serpapi_link} for detailed AI Overview
  │   ├── Parse text_blocks → extract full text
  │   ├── Parse references → extract citations & competitor domains
  │   ├── Check brand mention via stripos()
  │   └── Determine sentiment (keyword-based)
  │
  ├── 3. OpenAI Check (ChatGPT)
  │   ├── POST api.openai.com/v1/chat/completions
  │   ├── Model: gpt-4o with JSON response format
  │   ├── Parse JSON: response_text, brand_mentioned, sentiment
  │   └── Highlight brand name in HTML response
  │
  ├── 4. Combine Results
  │   └── { timestamp, google: {...}, chatgpt: {...} }
  │
  └── 5. Update ai_queries.json
      └── Set latest_result, last_checked, status="Checked"
```

### 4.3 Dashboard Data Loading (Frontend)

```
Page Load → dashboard.init()
  │
  ├── GET api.php?action=get_session
  │   → Check if authenticated, redirect to login if not
  │
  ├── GET api.php?action=get_data
  │   → Returns { aiQueries, responses, schema }
  │   → Queries filtered by client_id (role-based)
  │
  ├── GET api.php?action=list_users (admin only)
  │   → Populate client selector dropdown
  │
  └── Render Dashboard
      ├── Run calculations.js metrics on the data
      │   ├── calculateSoM() → Share of Mention %
      │   ├── calculateSentiment() → Sentiment score
      │   ├── calculateWinLoss() → Won/Mentioned/Lost
      │   ├── findCompetitorGaps() → Competitor analysis
      │   └── calculateCitationVelocity() → Citation tracking
      └── Render charts, tables, and stats
```

---

## 5. Data Storage Schema

All data is stored as JSON flat files in `data/`.

### 5.1 `data/users.json`

```json
[
  {
    "id": "u008",
    "email": "admin@example.com",
    "password_hash": "$2y$10$...",
    "name": "ExampleClient",
    "role": "client",
    "company": "ExampleClient",
    "created_at": "2026-02-24 09:10:00",
    "status": "active"
  }
]
```

### 5.2 `data/ai_queries.json`

```json
[
  {
    "id": "q560",
    "query": "generative ai solutions for enterprises",
    "brand_name": "ExampleClient",
    "location": "us",
    "client_id": "u008",
    "created_at": "2026-01-15 08:30:00",
    "status": "Checked",
    "last_checked": "2026-02-24 12:00:00",
    "latest_result": {
      "timestamp": "...",
      "google": { "response_text": "...", "brand_mentioned": true, "..." },
      "chatgpt": { "response_text": "...", "brand_mentioned": false, "..." }
    }
  }
]
```

### 5.3 `data/ai_responses.json`

Legacy/mock response data (used by `calculations.js` for metrics):

```json
[
  {
    "id": "r001",
    "prompt_id": "q001",
    "platform": "ChatGPT",
    "test_date": "2026-01-15",
    "brand_mentioned": true,
    "position": 3,
    "sentiment": "positive",
    "competitors_mentioned": ["HubSpot", "Semrush"],
    "response_text": "..."
  }
]
```

---

## 6. Authentication & Access Control

| Feature | Detail |
|---------|--------|
| **Method** | PHP native sessions (`session_start()`) |
| **Password Storage** | `password_hash()` with `PASSWORD_DEFAULT` (bcrypt) |
| **Verification** | `password_verify()` against stored hash |
| **Roles** | `admin` or `client` |
| **Session Data** | `user_id`, `user_email`, `user_role`, `user_name`, `user_company` |

**Role-based access matrix:**

| Action | Admin | Client |
|--------|:-----:|:------:|
| View all queries | ✅ | ❌ |
| View own queries | ✅ | ✅ |
| Add/edit/delete queries | ✅ | ❌ |
| Run AI checks | ✅ | ✅ (own only) |
| Manage users | ✅ | ❌ |
| Manage API keys | ✅ | ❌ |
| Export data | ✅ | ✅ (own only) |

---

## 7. Calculations & Metrics

Computed client-side in `js/calculations.js`:

| Metric | Function | Formula |
|--------|----------|---------|
| **Share of Mention** | `calculateSoM()` | `(brand_mentioned count / total responses) × 100` |
| **Sentiment Score** | `calculateSentiment()` | Weighted average: positive=10, neutral=5, negative=0 |
| **Win/Loss** | `calculateWinLoss()` | Won = position 1 + mentioned; Lost = not mentioned |
| **Competitor Gaps** | `findCompetitorGaps()` | Responses where competitors mentioned but brand is not |
| **Citation Velocity** | `calculateCitationVelocity()` | Count of unique citations across responses |
| **Revenue Impact** | `calculateRevenueImpact()` | AI-source conversions × $5,000 per conversion (estimate) |
| **Schema Score** | `calculateSchemaScore()` | `(valid schemas / total schemas) × 100` |

**Sentiment scoring thresholds:**

- `≥ 8.0` → 🟢 Green → "Leading Authority"
- `≥ 5.0` → 🟡 Yellow → "Service Provider"
- `< 5.0` → 🔴 Red → "At Risk"

---

## 8. Environment & Configuration

### 8.1 API Keys Storage

Keys are stored in `credentials/.env` (not tracked in Git):

```ini
OPENAI_API_KEY="sk-..."
SERPAPI_KEY="..."
BRAND_NAME="ExampleBrand"
```

### 8.2 Key Configuration Constants (`php/config.php`)

```php
define('BASE_PATH', dirname(__DIR__));
define('DATA_PATH', BASE_PATH . '/data');
define('CREDENTIALS_PATH', BASE_PATH . '/credentials');
date_default_timezone_set('Asia/Dubai');
```

### 8.3 CORS Headers

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### 8.4 Running Locally

```bash
php -S localhost:8000
```

Open `http://localhost:8000` in browser.
