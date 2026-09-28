<?php
require_once 'config.php';

/**
 * Auth helper functions for session-based authentication.
 * Users stored in data/users.json with password_hash().
 */

function getUsers() {
    return readJson('users.json');
}

function saveUsers($users) {
    writeJson('users.json', $users);
}

function findUserByEmail($email) {
    $users = getUsers();
    foreach ($users as $user) {
        if (strtolower($user['email']) === strtolower($email)) {
            return $user;
        }
    }
    return null;
}

function findUserById($id) {
    $users = getUsers();
    foreach ($users as $user) {
        if ($user['id'] === $id) {
            return $user;
        }
    }
    return null;
}

function attemptLogin($email, $password) {
    $user = findUserByEmail($email);
    if (!$user) {
        return ['error' => 'Invalid email or password'];
    }
    if ($user['status'] !== 'active') {
        return ['error' => 'Account is inactive. Contact admin.'];
    }
    if (!password_verify($password, $user['password_hash'])) {
        return ['error' => 'Invalid email or password'];
    }

    // Set session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_company'] = $user['company'] ?? '';

    return [
        'status' => 'success',
        'user' => safeUserData($user)
    ];
}

function logout() {
    session_destroy();
    return ['status' => 'success'];
}

function getSession() {
    if (!isset($_SESSION['user_id'])) {
        return ['authenticated' => false];
    }
    return [
        'authenticated' => true,
        'user' => [
            'id' => $_SESSION['user_id'],
            'email' => $_SESSION['user_email'],
            'role' => $_SESSION['user_role'],
            'name' => $_SESSION['user_name'],
            'company' => $_SESSION['user_company'] ?? ''
        ]
    ];
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
}

function requireAdmin() {
    requireAuth();
    if ($_SESSION['user_role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
}

function isAdmin() {
    return isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin';
}

function currentUserId() {
    return $_SESSION['user_id'] ?? null;
}

function createUser($data) {
    $users = getUsers();

    // Check if email already exists
    foreach ($users as $u) {
        if (strtolower($u['email']) === strtolower($data['email'])) {
            return ['error' => 'Email already exists'];
        }
    }

    // Generate new ID
    $maxId = 0;
    foreach ($users as $u) {
        if (preg_match('/^u(\d+)$/', $u['id'], $m)) {
            $maxId = max($maxId, intval($m[1]));
        }
    }

    $newUser = [
        'id' => 'u' . str_pad($maxId + 1, 3, '0', STR_PAD_LEFT),
        'email' => $data['email'],
        'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT),
        'name' => $data['name'],
        'role' => $data['role'] ?? 'client',
        'company' => $data['company'] ?? '',
        'created_at' => date('Y-m-d H:i:s'),
        'status' => 'active'
    ];

    $users[] = $newUser;
    saveUsers($users);

    return ['status' => 'success', 'user' => safeUserData($newUser)];
}

function safeUserData($user) {
    return [
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'role' => $user['role'],
        'company' => $user['company'] ?? '',
        'created_at' => $user['created_at'] ?? '',
        'status' => $user['status'] ?? 'active'
    ];
}

/**
 * Initialize admin account if users.json only has placeholder hash
 * This runs once on first login attempt.
 */
function ensureAdminAccount() {
    $users = getUsers();
    if (empty($users)) {
        $users = [[
            'id' => 'u001',
            'email' => 'admin@example.com',
            'password_hash' => password_hash('admin123', PASSWORD_DEFAULT),
            'name' => 'Admin',
            'role' => 'admin',
            'company' => 'ExampleBrand',
            'created_at' => date('Y-m-d H:i:s'),
            'status' => 'active'
        ]];
        saveUsers($users);
        return;
    }

    // Fix placeholder hash if present
    foreach ($users as &$u) {
        if ($u['id'] === 'u001' && strpos($u['password_hash'], '$2y$10$placeholder') !== false) {
            $u['password_hash'] = password_hash('admin123', PASSWORD_DEFAULT);
        }
    }
    saveUsers($users);
}

// Ensure admin exists on load
ensureAdminAccount();
?>
