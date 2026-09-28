<?php
// serpapi_service.php

function scanWithSerpAPI($prompt, $apiKey, $brandName = '', $location = 'us', $openApiKey = '') {
    if (empty($apiKey)) {
        return [
            'error' => 'SerpAPI Key not configured.'
        ];
    }

    // Default Brand Name if not provided but available in env
    if (empty($brandName)) {
        $envPath = CREDENTIALS_PATH . '/.env';
        if (file_exists($envPath)) {
            $env = parse_ini_file($envPath);
            $brandName = $env['BRAND_NAME'] ?? 'ExampleBrand';
        } else {
            $brandName = 'ExampleBrand';
        }
    }

    // Location Logic
    $geoParam = "United+States";
    $glParam = "us";
    
    if ($location === 'ae') {
        $geoParam = "United+Arab+Emirates";
        $glParam = "ae";
    } elseif ($location === 'in') {
        $geoParam = "India";
        $glParam = "in";
    } elseif ($location === 'nl') {
        $geoParam = "Netherlands";
        $glParam = "nl";
    }

    // Step 1: Standard Google Search to get the AI Overview Token/Link
    $url = "https://serpapi.com/search.json?engine=google&q=" . urlencode($prompt) . "&api_key=" . $apiKey . "&location=" . $geoParam . "&gl=" . $glParam . "&hl=en";
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return ['error' => 'SerpAPI Error (Step 1): ' . $httpCode];
    }

    $result = json_decode($response, true);
    
    $responseText = "";
    $citations = [];
    $competitors = [];
    $rawAiText = "";
    $aiOverview = null;

    // Check for AI Overview in standard result
    $initialAiOverview = $result['ai_overview'] ?? null;
    
    // Step 2: If available, fetch detailed AI Overview using serpapi_link or page_token logic
    // The google_ai_overview engine typically needs a page_token, which is often in the serpapi_link
    
    if ($initialAiOverview && isset($initialAiOverview['serpapi_link'])) {
        // The link usually contains the engine=google_ai_overview part or similar
        // We append the API key
        $detailUrl = $initialAiOverview['serpapi_link'] . "&api_key=" . $apiKey;
        
        $ch2 = curl_init($detailUrl);
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        $detailResponse = curl_exec($ch2);
        $detailHttpCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
        curl_close($ch2);
        
        if ($detailHttpCode === 200) {
            $detailResult = json_decode($detailResponse, true);
            // The detailed result typically has 'ai_overview' at root or is the root object depending on engine
            $aiOverview = $detailResult['ai_overview'] ?? $detailResult; 
        } else {
             // Fallback to initial but it might lack deep references.
             $aiOverview = $initialAiOverview;
        }
    } else {
        // No AI Overview link found
        $aiOverview = $initialAiOverview;
    }

    if ($aiOverview) {
        $responseText .= "<div style='background-color: #f8fafc; padding: 1.5rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 2rem;'>";
        $responseText .= "<h3 style='margin-top:0; display:flex; align-items:center; gap:0.5rem;'>🤖 AI Overview</h3>";
        
        // Helper to extract text for analysis
        $extractText = "";

        // Handle "text_blocks" structure (from user example)
        if (isset($aiOverview['text_blocks']) && is_array($aiOverview['text_blocks'])) {
            foreach ($aiOverview['text_blocks'] as $block) {
                $type = $block['type'] ?? '';
                if ($type === 'paragraph') {
                    if (isset($block['snippet'])) {
                        $text = $block['snippet'];
                        $responseText .= "<p style='line-height: 1.6; margin-bottom: 1rem;'>" . $text . "</p>";
                        $extractText .= $text . " ";
                    }
                } elseif ($type === 'heading') {
                    if (isset($block['snippet'])) {
                         $responseText .= "<h4 style='margin-top: 1rem; margin-bottom: 0.5rem;'>" . $block['snippet'] . "</h4>";
                         $extractText .= $block['snippet'] . " ";
                    }
                } elseif ($type === 'list') {
                    if (isset($block['list']) && is_array($block['list'])) {
                        $responseText .= "<ul style='margin-bottom: 1rem; padding-left: 1.5rem;'>";
                        foreach ($block['list'] as $listItem) {
                            // list item can be string or object with snippet/text_blocks
                            $itemText = "";
                            if (is_array($listItem)) {
                                if (isset($listItem['snippet'])) {
                                     $itemText = $listItem['snippet'];
                                } elseif (isset($listItem['text_blocks'])) {
                                     // Recursive simple handling? probably too complex, just grab text
                                     foreach($listItem['text_blocks'] as $subBlock) {
                                         if(isset($subBlock['snippet'])) $itemText .= $subBlock['snippet'] . " ";
                                     }
                                }
                            } else {
                                $itemText = $listItem;
                            }

                            if ($itemText) {
                                $responseText .= "<li style='margin-bottom: 0.5rem;'>" . $itemText . "</li>";
                                $extractText .= $itemText . " ";
                            }
                        }
                        $responseText .= "</ul>";
                    }
                }
            }
        } 
        
        // Fallback: Handle textual content if text_blocks didn't catch it
        elseif (isset($aiOverview['text_content'])) {
             $content = nl2br($aiOverview['text_content']);
             $responseText .= "<p style='line-height: 1.6;'>" . $content . "</p>";
             $extractText .= $aiOverview['text_content'];
        }
        
        $rawAiText = $extractText;
        $responseText .= "</div>";

    } else {
        $responseText .= "<div style='padding: 1rem; border: 1px dashed #ccc; margin-bottom: 2rem;'><strong>🤖 AI Overview</strong><br><em>No AI Overview link found for this query in UAE.</em></div>";
    }


    /* --- HIGHLIGHT BRAND IN AI TEXT --- */
    if (!empty($brandName) && !empty($extractText)) {
        // Case insensitive replace with styled span
        // regex escape brand name
        $escapedBrand = preg_quote($brandName, '/');
        $pattern = "/\b($escapedBrand)\b/i";
        $replacement = "<span style='background-color: #dcfce7; color: #166534; padding: 2px 4px; border-radius: 4px; font-weight: bold;'>$1</span>";
        
        $responseText = preg_replace($pattern, $replacement, $responseText);
    }
    
    // 2. Extract Citations
    // STRICT MODE: Only use ai_overview['references']
    
    if ($aiOverview && isset($aiOverview['references']) && is_array($aiOverview['references'])) {
        foreach ($aiOverview['references'] as $item) {
            $title = $item['title'] ?? 'No Title';
            $link = $item['link'] ?? '#';
            $snippet = $item['snippet'] ?? '';
            $source = $item['source'] ?? '';
            
            $domain = parse_url($link, PHP_URL_HOST);
            $domain = str_replace('www.', '', $domain);

            if ($domain) $competitors[] = $domain;

            $isBrandMention = false;
            // Check in title, snippet, source, domain
            if (stripos($title, $brandName) !== false || 
                stripos($snippet, $brandName) !== false || 
                stripos($source, $brandName) !== false ||
                stripos($domain, str_replace(' ', '', $brandName)) !== false) {
                $isBrandMention = true;
            }

            $citations[] = [
                'title' => $title,
                'link' => $link,
                'snippet' => $snippet,
                'source' => $source,
                'domain' => $domain,
                'is_brand_mention' => $isBrandMention
            ];
        }
    }

    // Analyze Visibility
    $brandMentioned = false;
    
    // Check in AI Overview text
    if (stripos($rawAiText, $brandName) !== false) {
        $brandMentioned = true;
    }
    
    $sentiment = 'neutral';
    if ($brandMentioned) {
        // Simple keyword sentiment
        if (stripos($rawAiText, 'best') !== false || stripos($rawAiText, 'top') !== false || stripos($rawAiText, 'leading') !== false) {
            $sentiment = 'positive';
        }
    } else {
         $sentiment = 'negative'; 
    }

    $advancedMetrics = [
        'position' => 'Not Mentioned',
        'description_exact_words' => '',
        'competitors_before_brand' => [],
        'omitted_competitors' => []
    ];
    if (!empty($openApiKey) && !empty($rawAiText)) {
        require_once 'openai_service.php';
        if (function_exists('extractMetricsFromText')) {
            $extracted = extractMetricsFromText($rawAiText, $openApiKey, $brandName);
            $advancedMetrics = array_merge($advancedMetrics, $extracted);
        }
    }

    return [
        "response_text" => $responseText, // HTML
        "brand_mentioned" => $brandMentioned,
        "sentiment" => $sentiment,
        "competitors_mentioned" => array_unique($competitors),
        "citations" => $citations,
        "position" => $advancedMetrics['position'] ?? 'Not Mentioned',
        "description_exact_words" => $advancedMetrics['description_exact_words'] ?? '',
        "competitors_before_brand" => $advancedMetrics['competitors_before_brand'] ?? [],
        "omitted_competitors" => $advancedMetrics['omitted_competitors'] ?? []
    ];
}
?>
