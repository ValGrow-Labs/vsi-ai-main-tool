<?php
require_once 'config.php';
require_once 'auth.php';

$action = $_GET['action'] ?? '';

// Public actions (no auth required)
$publicActions = ['login', 'logout', 'get_session'];

// Protected actions (any authenticated user)
$protectedActions = ['get_data', 'get_ai_queries', 'run_ai_query_check', 'get_settings', 'export'];

// Admin-only actions
$adminActions = ['save_ai_query', 'delete_ai_query', 'add_response', 'run_scan', 'save_settings', 
                 'create_user', 'list_users', 'delete_user', 'update_user'];

switch ($action) {
    // --- Auth Actions (Public) ---
    case 'login':
        handleLogin();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'get_session':
        handleGetSession();
        break;

    // --- User Management (Admin Only) ---
    case 'create_user':
        requireAdmin();
        handleCreateUser();
        break;
    case 'list_users':
        requireAdmin();
        handleListUsers();
        break;
    case 'delete_user':
        requireAdmin();
        handleDeleteUser();
        break;
    case 'update_user':
        requireAdmin();
        handleUpdateUser();
        break;

    // --- Data Actions (Authenticated) ---
    case 'get_data':
        requireAuth();
        handleGetData();
        break;
    case 'get_ai_queries':
        requireAuth();
        handleGetAiQueries();
        break;
    case 'save_ai_query':
        requireAdmin();
        handleSaveAiQuery();
        break;
    case 'delete_ai_query':
        requireAdmin();
        handleDeleteAiQuery();
        break;
    case 'run_ai_query_check':
        requireAuth();
        handleRunAiQueryCheck();
        break;
    case 'run_scan':
        requireAdmin();
        handleRunScan();
        break;
    case 'get_settings':
        requireAuth();
        handleGetSettings();
        break;
    case 'save_settings':
        requireAdmin();
        handleSaveSettings();
        break;
    case 'export':
        requireAuth();
        handleExport();
        break;
    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}

// ==========================================
// AUTH HANDLERS
// ==========================================

function handleLogin() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';

    if (empty($email) || empty($password)) {
        echo json_encode(['error' => 'Email and password are required']);
        return;
    }

    $result = attemptLogin($email, $password);
    echo json_encode($result);
}

function handleLogout() {
    echo json_encode(logout());
}

function handleGetSession() {
    echo json_encode(getSession());
}

// ==========================================
// USER MANAGEMENT HANDLERS
// ==========================================

function handleCreateUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);

    if (empty($input['email']) || empty($input['password']) || empty($input['name'])) {
        echo json_encode(['error' => 'Name, email, and password are required']);
        return;
    }

    $result = createUser($input);
    echo json_encode($result);
}

function handleListUsers() {
    $users = getUsers();
    $safeUsers = array_map(function($u) { return safeUserData($u); }, $users);
    echo json_encode(array_values($safeUsers));
}

function handleDeleteUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';

    if ($id === 'u001') {
        echo json_encode(['error' => 'Cannot delete the primary admin']);
        return;
    }

    $users = getUsers();
    $users = array_values(array_filter($users, fn($u) => $u['id'] !== $id));
    saveUsers($users);

    // Also remove queries associated with this user
    $queries = readJson('ai_queries.json');
    $queries = array_values(array_filter($queries, fn($q) => ($q['client_id'] ?? '') !== $id));
    writeJson('ai_queries.json', $queries);

    echo json_encode(['status' => 'success']);
}

function handleUpdateUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';

    $users = getUsers();
    $found = false;
    foreach ($users as &$u) {
        if ($u['id'] === $id) {
            if (!empty($input['name'])) $u['name'] = $input['name'];
            if (!empty($input['email'])) $u['email'] = $input['email'];
            if (!empty($input['company'])) $u['company'] = $input['company'];
            if (!empty($input['status'])) $u['status'] = $input['status'];
            if (!empty($input['password'])) {
                $u['password_hash'] = password_hash($input['password'], PASSWORD_DEFAULT);
            }
            $found = true;
            break;
        }
    }

    if (!$found) {
        echo json_encode(['error' => 'User not found']);
        return;
    }

    saveUsers($users);
    echo json_encode(['status' => 'success']);
}

// ==========================================
// DATA HANDLERS
// ==========================================

function handleGetData() {
    $type = $_GET['type'] ?? '';
    $files = [
        'responses' => 'ai_responses.json',
        'schema' => 'schema_validation.json'
    ];

    if (array_key_exists($type, $files)) {
        echo json_encode(readJson($files[$type]));
    } else {
        $allData = [];
        foreach ($files as $key => $file) {
            $allData[$key] = readJson($file);
        }
        // Also include AI queries (filtered by role)
        $allData['aiQueries'] = getFilteredAiQueries();
        echo json_encode($allData);
    }
}

function getFilteredAiQueries() {
    $queries = readJson('ai_queries.json');
    if (isAdmin()) {
        $clientFilter = $_GET['client_id'] ?? '';
        if (!empty($clientFilter)) {
            $queries = array_values(array_filter($queries, fn($q) => ($q['client_id'] ?? '') === $clientFilter));
        }
        return $queries;
    } else {
        $userId = currentUserId();
        return array_values(array_filter($queries, fn($q) => ($q['client_id'] ?? '') === $userId));
    }
}

function handleGetAiQueries() {
    echo json_encode(getFilteredAiQueries());
}

function handleSaveAiQuery() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['query'])) {
        echo json_encode(['error' => 'Invalid input']);
        return;
    }
    $queries = readJson('ai_queries.json');
    if (isset($input['id'])) {
        foreach ($queries as &$q) {
            if ($q['id'] === $input['id']) {
                $q = array_merge($q, $input);
                break;
            }
        }
    } else {
        // ID Generation: Find max ID to avoid collisions
        $maxId = 0;
        foreach ($queries as $q) {
            if (isset($q['id']) && preg_match('/^q(\d+)$/', $q['id'], $matches)) {
                $num = intval($matches[1]);
                if ($num > $maxId) {
                    $maxId = $num;
                }
            }
        }
        $newIdNum = $maxId + 1;
        $input['id'] = 'q' . str_pad($newIdNum, 3, '0', STR_PAD_LEFT);
        
        $input['created_at'] = date('Y-m-d H:i:s');
        $input['last_checked'] = null;
        $input['status'] = 'Pending';
        if (!isset($input['brand_name'])) {
            $input['brand_name'] = '';
        }
        if (!isset($input['location'])) {
            $input['location'] = 'us'; 
        }
        // Assign to client_id (required for admin)
        if (!isset($input['client_id'])) {
            $input['client_id'] = currentUserId();
        }
        $queries[] = $input;
    }
    writeJson('ai_queries.json', $queries);
    echo json_encode(['status' => 'success', 'data' => $queries]);
}

function handleDeleteAiQuery() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';
    $queries = readJson('ai_queries.json');
    $queries = array_values(array_filter($queries, fn($q) => $q['id'] !== $id));
    writeJson('ai_queries.json', $queries);
    echo json_encode(['status' => 'success']);
}

function handleRunAiQueryCheck() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? '';
    
    $queries = readJson('ai_queries.json');
    $targetQuery = null;
    $targetIndex = -1;
    
    foreach ($queries as $index => $q) {
        if ($q['id'] === $id) {
            $targetQuery = $q;
            $targetIndex = $index;
            break;
        }
    }
    
    if (!$targetQuery) {
        echo json_encode(['error' => 'Query not found']);
        return;
    }

    // Non-admin can only check their own queries
    if (!isAdmin() && ($targetQuery['client_id'] ?? '') !== currentUserId()) {
        echo json_encode(['error' => 'Access denied']);
        return;
    }
    
    // Get API Keys
    $envPath = CREDENTIALS_PATH . '/.env';
    $serpApiKey = '';
    $openApiKey = '';
    $globalBrandName = 'ExampleBrand';

    if (file_exists($envPath)) {
        $env = parse_ini_file($envPath);
        $serpApiKey = $env['SERPAPI_KEY'] ?? '';
        $openApiKey = $env['OPENAI_API_KEY'] ?? '';
        $globalBrandName = $env['BRAND_NAME'] ?? 'ExampleBrand';
    }
    
    if (empty($serpApiKey)) {
        echo json_encode(['error' => 'SerpAPI Key not configured']);
        return;
    }
    
    $queryBrandName = !empty($targetQuery['brand_name']) ? $targetQuery['brand_name'] : $globalBrandName;
    $queryLocation = !empty($targetQuery['location']) ? $targetQuery['location'] : 'us';

    $results = [
        'timestamp' => date('Y-m-d H:i:s'),
        'google' => null,
        'chatgpt' => null
    ];

    // 1. Google AI Overview Check
    require_once 'serpapi_service.php';
    $googleAnalysis = scanWithSerpAPI($targetQuery['query'], $serpApiKey, $queryBrandName, $queryLocation, $openApiKey);
    
    if (isset($googleAnalysis['error'])) {
        $results['google'] = ['error' => $googleAnalysis['error']];
    } else {
        $results['google'] = $googleAnalysis;
    }

    // 2. ChatGPT Check
    if (!empty($openApiKey)) {
        require_once 'openai_service.php';
        $chatGptAnalysis = scanPromptWithOpenAI($targetQuery['query'], $openApiKey, $queryBrandName);
        if (isset($chatGptAnalysis['error'])) {
             $results['chatgpt'] = ['error' => $chatGptAnalysis['error']];
        } else {
             require_once 'openai_service.php';
             if (function_exists('extractMetricsFromText')) {
                 $advancedMetrics = extractMetricsFromText($chatGptAnalysis['response_text'], $openApiKey, $queryBrandName);
                 $chatGptAnalysis['position'] = $advancedMetrics['position'] ?? 'Not Mentioned';
                 $chatGptAnalysis['description_exact_words'] = $advancedMetrics['description_exact_words'] ?? '';
                 $chatGptAnalysis['competitors_before_brand'] = $advancedMetrics['competitors_before_brand'] ?? [];
                 $chatGptAnalysis['omitted_competitors'] = $advancedMetrics['omitted_competitors'] ?? [];
             }
             $results['chatgpt'] = $chatGptAnalysis;
        }
    } else {
        $results['chatgpt'] = ['error' => 'OpenAI Key not configured'];
    }
    
    // Update Query with combined results
    $queries[$targetIndex]['last_checked'] = date('Y-m-d H:i:s');
    $queries[$targetIndex]['status'] = 'Checked';
    $queries[$targetIndex]['latest_result'] = $results;
    
    writeJson('ai_queries.json', $queries);
    
    echo json_encode(['status' => 'success', 'data' => $queries[$targetIndex]]);
}

function handleRunScan() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $prompt = $input['prompt'] ?? '';
    $platform = $input['platform'] ?? 'openai';
    
    if (empty($prompt)) {
        echo json_encode(['error' => 'Prompt is required']);
        return;
    }

    $envPath = CREDENTIALS_PATH . '/.env';
    $apiKey = '';
    if (file_exists($envPath)) {
        $env = parse_ini_file($envPath);
        $apiKey = $env['OPENAI_API_KEY'] ?? '';
        $serpApiKey = $env['SERPAPI_KEY'] ?? '';
    }

    if ($platform === 'google') {
        if (empty($serpApiKey)) {
             echo json_encode(['error' => 'SerpAPI Key not configured.']);
             return;
        }
        require_once 'serpapi_service.php';
        $analysis = scanWithSerpAPI($prompt, $serpApiKey, '', 'us', $apiKey);
        $platformLabel = "Google AI Overview";
    } else {
        if (empty($apiKey)) {
             sleep(1);
             $mockResult = [
                "response_text" => "Simulated AI response for '$prompt'.",
                "brand_mentioned" => false,
                "sentiment" => "neutral",
                "position" => rand(1, 5),
                "competitors_mentioned" => [],
                "citations" => []
             ];
             
             $responses = readJson('ai_responses.json');
             $newEntry = [
                "id" => 'r' . str_pad(count($responses) + 1, 3, '0', STR_PAD_LEFT),
                "prompt_id" => "manual_scan",
                "platform" => "ChatGPT (Simulated)",
                "test_date" => date('Y-m-d'),
                "brand_mentioned" => $mockResult['brand_mentioned'],
                "position" => $mockResult['position'],
                "competitors_mentioned" => $mockResult['competitors_mentioned'],
                "sentiment" => $mockResult['sentiment'],
                "citations" => $mockResult['citations'],
                "response_text" => $mockResult['response_text'],
                "key_phrases" => []
             ];
             $responses[] = $newEntry;
             writeJson('ai_responses.json', $responses);
             
             echo json_encode(['status' => 'success', 'data' => $newEntry, 'note' => 'Demo mode (No API Key)']);
             return;
        }

        require_once 'openai_service.php';
        $analysis = scanPromptWithOpenAI($prompt, $apiKey);
        $platformLabel = "ChatGPT (Live)";
    }

    if (isset($analysis['error'])) {
        echo json_encode($analysis);
        return;
    }

    $responses = readJson('ai_responses.json');
    $newEntry = array_merge([
        "id" => 'r' . str_pad(count($responses) + 1, 3, '0', STR_PAD_LEFT),
        "prompt_id" => "live_scan",
        "platform" => $platformLabel,
        "test_date" => date('Y-m-d'),
        "key_phrases" => []
    ], $analysis);

    $responses[] = $newEntry;
    writeJson('ai_responses.json', $responses);

    echo json_encode(['status' => 'success', 'data' => $newEntry]);
}

function handleGetSettings() {
    $envPath = CREDENTIALS_PATH . '/.env';
    $settings = [
        'openai_key' => '',
        'serpapi_key' => '',
        'brand_name' => 'ExampleBrand'
    ];
    
    if (file_exists($envPath)) {
        $env = parse_ini_file($envPath);
        $settings['openai_key'] = $env['OPENAI_API_KEY'] ?? '';
        $settings['serpapi_key'] = $env['SERPAPI_KEY'] ?? '';
        $settings['brand_name'] = $env['BRAND_NAME'] ?? 'ExampleBrand';
    }
    
    // Mask keys for security
    if ($settings['openai_key']) $settings['openai_key'] = substr($settings['openai_key'], 0, 8) . '...';
    if ($settings['serpapi_key']) $settings['serpapi_key'] = substr($settings['serpapi_key'], 0, 8) . '...';
    
    echo json_encode($settings);
}

function handleSaveSettings() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Method not allowed']);
        return;
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $envPath = CREDENTIALS_PATH . '/.env';
    
    $currentEnv = [];
    if (file_exists($envPath)) {
        $currentEnv = parse_ini_file($envPath);
    }
    
    if (!empty($input['openai_key']) && strpos($input['openai_key'], '...') === false) {
        $currentEnv['OPENAI_API_KEY'] = $input['openai_key'];
    }
    if (!empty($input['serpapi_key']) && strpos($input['serpapi_key'], '...') === false) {
        $currentEnv['SERPAPI_KEY'] = $input['serpapi_key'];
    }
    if (!empty($input['brand_name'])) {
        $currentEnv['BRAND_NAME'] = $input['brand_name'];
    }
    
    $content = "";
    foreach ($currentEnv as $key => $val) {
        $content .= "{$key}=\"{$val}\"\n";
    }
    
    file_put_contents($envPath, $content);
    echo json_encode(['status' => 'success']);
}

function handleExport() {
    $format = $_GET['format'] ?? 'json';
    if ($format === 'csv') {
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="ai_queries_export.csv"');
        
        $output = fopen('php://output', 'w');
        fputcsv($output, ['Query', 'Brand', 'Location', 'Client', 'Status', 'Last Checked', 'Google Mentioned', 'Google Sentiment', 'Google Position', 'Google Exact Words', 'Google Omissions', 'Google Extracted Competitors', 'Google Top Citation', 'ChatGPT Mentioned', 'ChatGPT Sentiment']);
        
        $queries = getFilteredAiQueries();
        $users = getUsers();
        $userMap = array_column($users, 'name', 'id');
        
        foreach ($queries as $q) {
            $googleMentioned = 'N/A';
            $googleSentiment = 'N/A';
            $googlePosition = 'N/A';
            $googleExactWords = 'N/A';
            $googleOmissions = 'N/A';
            $googleExtractedCompetitors = 'N/A';
            $googleTopCitation = 'N/A';
            $chatgptMentioned = 'N/A';
            $chatgptSentiment = 'N/A';
            if (isset($q['latest_result'])) {
                if (isset($q['latest_result']['google'])) {
                    $google = $q['latest_result']['google'];
                    $googleMentioned = ($google['brand_mentioned'] ?? false) ? 'Yes' : 'No';
                    $googleSentiment = $google['sentiment'] ?? 'N/A';
                    $googlePosition = $google['position'] ?? 'N/A';
                    $googleExactWords = $google['description_exact_words'] ?? 'N/A';
                    $googleExtractedCompetitors = isset($google['competitors_before_brand']) && is_array($google['competitors_before_brand']) ? implode(', ', $google['competitors_before_brand']) : 'N/A';
                    $googleOmissions = isset($google['omitted_competitors']) && is_array($google['omitted_competitors']) ? implode(', ', $google['omitted_competitors']) : 'N/A';
                    if (isset($google['citations']) && is_array($google['citations']) && count($google['citations']) > 0) {
                        $firstCit = $google['citations'][0];
                        $googleTopCitation = is_array($firstCit) ? ($firstCit['link'] ?? $firstCit['url'] ?? 'N/A') : $firstCit;
                    }
                }
                if (isset($q['latest_result']['chatgpt'])) {
                    $chatgpt = $q['latest_result']['chatgpt'];
                    $chatgptMentioned = ($chatgpt['brand_mentioned'] ?? false) ? 'Yes' : 'No';
                    $chatgptSentiment = $chatgpt['sentiment'] ?? 'N/A';
                }
            }
            fputcsv($output, [
                $q['query'],
                $q['brand_name'] ?? '',
                $q['location'] ?? 'us',
                $userMap[$q['client_id'] ?? ''] ?? 'Unassigned',
                $q['status'] ?? 'Pending',
                $q['last_checked'] ?? 'Never',
                $googleMentioned,
                $googleSentiment,
                $googlePosition,
                $googleExactWords,
                $googleOmissions,
                $googleExtractedCompetitors,
                $googleTopCitation,
                $chatgptMentioned,
                $chatgptSentiment
            ]);
        }
        fclose($output);
        exit;
    }
    echo json_encode(['error' => 'Unsupported format']);
}
