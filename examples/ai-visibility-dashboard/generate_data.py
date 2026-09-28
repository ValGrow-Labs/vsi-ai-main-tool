import json
import random
from datetime import datetime, timedelta

# Configuration
BRANDS = ["ExampleBrand", "OrbitAI", "NexusFlow"]
PLATFORMS = ["ChatGPT", "Gemini", "Perplexity", "Claude", "Microsoft Copilot"]
QUERIES = [
    "Best AI visibility tools 2026",
    "Top brand tracking software",
    "How to monitor AI overviews",
    "ExampleBrand vs OrbitAI reviews",
    "Automated SEO reporting tools",
    "Enterprise AI analytics platforms",
    "Competitor analysis tools for AI"
]
START_DATE = datetime(2025, 11, 1) # 3-4 months back
END_DATE = datetime(2026, 2, 13)

# Data Holders
queries_data = []
responses_data = []

# id counters
q_counter = 1
r_counter = 1

def random_date(start, end):
    return start + timedelta(
        seconds=random.randint(0, int((end - start).total_seconds())),
    )

print("Generating data...")

for brand in BRANDS:
    # Generate 15 queries per brand
    for _ in range(15):
        q_id = f"q{q_counter:03d}"
        q_counter += 1
        
        query_text = random.choice(QUERIES)
        timestamp = random_date(START_DATE, END_DATE)
        
        # Create Query Entry
        q_entry = {
            "id": q_id,
            "query": query_text,
            "brand_name": brand,
            "location": "us",
            "created_at": timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            "status": "Checked"
        }
        queries_data.append(q_entry)
        
        # Generate Responses for this query (1-3 platforms per query)
        selected_platforms = random.sample(PLATFORMS, k=random.randint(1, 3))
        
        for plat in selected_platforms:
            r_id = f"r{r_counter:03d}"
            r_counter += 1
            
            # Logic: 
            # - If brand is Query Brand, high chance of mention (60%)
            # - If mentioned, sentiment is mostly positive/neutral
            # - Competitors mentioned: random subset of other brands + generics
            
            is_brand_query = (brand in query_text) # If query specifically asks about brand
            mention_chance = 0.8 if is_brand_query else 0.4
            
            brand_mentioned = random.random() < mention_chance
            
            sentiment = "neutral"
            if brand_mentioned:
                val = random.random()
                if val < 0.6: sentiment = "positive"
                elif val < 0.9: sentiment = "neutral"
                else: sentiment = "negative"
            
            # Competitors
            other_brands = [b for b in BRANDS if b != brand]
            extras = ["HubSpot", "Semrush", "Ahrefs"]
            pool = other_brands + extras
            mentioned_comps = random.sample(pool, k=random.randint(0, 3))
            
            # Position
            position = random.randint(1, 10) if brand_mentioned else 0
            
            r_entry = {
                "id": r_id,
                "prompt_id": q_id,
                "platform": plat,
                "test_date": timestamp.strftime("%Y-%m-%d"),
                "brand_mentioned": brand_mentioned,
                "position": position,
                "sentiment": sentiment,
                "competitors_mentioned": mentioned_comps,
                "response_text": f"Response regarding {query_text} on {plat}..."
            }
            responses_data.append(r_entry)

# Write files
with open('data/ai_queries.json', 'w') as f:
    json.dump(queries_data, f, indent=4)

with open('data/ai_responses.json', 'w') as f:
    json.dump(responses_data, f, indent=4)

print(f"Generated {len(queries_data)} queries and {len(responses_data)} responses.")
