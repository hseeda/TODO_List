<?php
session_start([
    'cookie_lifetime' => 86400,
    'cookie_secure' => false,
    'cookie_httponly' => true
]);
header('Content-Type: application/json');
require 'db.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// --- Auth Routes ---

if ($action === 'register' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';

    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password required']);
        exit;
    }

    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)");
    try {
        $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
        http_response_code(201);
        echo json_encode(['message' => 'User created']);
    } catch (PDOException $e) {
        http_response_code(409); // Conflict
        echo json_encode(['error' => 'Username already taken']);
    }
    exit;
}

if ($action === 'login' && $method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$data['username']]);
    $user = $stmt->fetch();

    if ($user && password_verify($data['password'], $user['password_hash'])) {
        $_SESSION['user_id'] = $user['id'];
        echo json_encode(['message' => 'Login successful', 'user' => ['username' => $user['username']]]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
    }
    exit;
}

if ($action === 'check-auth' && $method === 'GET') {
    if (isset($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("SELECT username FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        echo json_encode(['authenticated' => true, 'user' => ['username' => $user['username']]]);
    } else {
        http_response_code(401);
        echo json_encode(['authenticated' => false]);
    }
    exit;
}

if ($action === 'logout') {
    session_destroy();
    echo json_encode(['message' => 'Logged out']);
    exit;
}

// --- Group Routes ---

if ($action === 'create-group' && $method === 'POST') {
    if (!isset($_SESSION['user_id']))
        exit_unauthorized();
    $data = json_decode(file_get_contents('php://input'), true);
    $name = $data['name'] ?? 'New Group';
    $user_id = $_SESSION['user_id'];

    // Generate unique 6-char code
    $code = strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 6));

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("INSERT INTO groups (name, share_code, created_by) VALUES (?, ?, ?)");
        $stmt->execute([$name, $code, $user_id]);
        $group_id = $pdo->lastInsertId();

        // Add creator as member
        $stmt = $pdo->prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)");
        $stmt->execute([$group_id, $user_id]);

        $pdo->commit();
        echo json_encode(['success' => true, 'group' => ['id' => $group_id, 'name' => $name, 'share_code' => $code]]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create group']);
    }
    exit;
}

if ($action === 'join-group' && $method === 'POST') {
    if (!isset($_SESSION['user_id']))
        exit_unauthorized();
    $data = json_decode(file_get_contents('php://input'), true);
    $code = $data['code'] ?? '';
    $user_id = $_SESSION['user_id'];

    $stmt = $pdo->prepare("SELECT id, name FROM groups WHERE share_code = ?");
    $stmt->execute([$code]);
    $group = $stmt->fetch();

    if (!$group) {
        http_response_code(404);
        echo json_encode(['error' => 'Invalid share code']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)");
        $stmt->execute([$group['id'], $user_id]);
        echo json_encode(['success' => true, 'group' => $group]);
    } catch (PDOException $e) {
        // Likely duplicate entry (already joined)
        echo json_encode(['success' => true, 'group' => $group, 'message' => 'Already joined']);
    }
    exit;
}

if ($action === 'get-groups' && $method === 'GET') {
    if (!isset($_SESSION['user_id']))
        exit_unauthorized();
    $user_id = $_SESSION['user_id'];

    $stmt = $pdo->prepare("
        SELECT g.id, g.name, g.share_code 
        FROM groups g 
        JOIN group_members gm ON g.id = gm.group_id 
        WHERE gm.user_id = ?
    ");
    $stmt->execute([$user_id]);
    echo json_encode($stmt->fetchAll());
    exit;
}

// --- Protected Routes (Modified for Groups) ---

if (!isset($_SESSION['user_id'])) {
    exit_unauthorized();
}

$user_id = $_SESSION['user_id'];

// List Todos
if ($method === 'GET') {
    $group_id = isset($_GET['group_id']) && is_numeric($_GET['group_id']) ? $_GET['group_id'] : null;

    if ($group_id) {
        // Verify membership
        if (!is_member($pdo, $group_id, $user_id)) {
            exit_unauthorized();
        }

        $stmt = $pdo->prepare("SELECT * FROM todos WHERE group_id = ? ORDER BY created_at DESC");
        $stmt->execute([$group_id]);
    } else {
        $stmt = $pdo->prepare("SELECT * FROM todos WHERE user_id = ? AND group_id IS NULL ORDER BY created_at DESC");
        $stmt->execute([$user_id]);
    }
    echo json_encode($stmt->fetchAll());
    exit;
}

// Create Todo
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $group_id = isset($data['group_id']) && is_numeric($data['group_id']) ? $data['group_id'] : null;

    if ($group_id && !is_member($pdo, $group_id, $user_id)) {
        exit_unauthorized();
    }

    try {
        $stmt = $pdo->prepare("INSERT INTO todos (user_id, group_id, text, time, priority) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$user_id, $group_id, $data['text'], $data['time'], $data['priority']]);
        $data['id'] = $pdo->lastInsertId();
        echo json_encode($data);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// Helpers
function exit_unauthorized()
{
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

function is_member($pdo, $group_id, $user_id)
{
    $stmt = $pdo->prepare("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?");
    $stmt->execute([$group_id, $user_id]);
    return (bool) $stmt->fetch();
}


// Update/Delete (Soft) Todo
if ($method === 'PUT') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        exit;
    }

    // Check permission
    if (!can_edit_todo($pdo, $id, $user_id))
        exit_unauthorized();

    $data = json_decode(file_get_contents('php://input'), true);

    $fields = [];
    $params = [];
    if (isset($data['text'])) {
        $fields[] = 'text = ?';
        $params[] = $data['text'];
    }
    if (isset($data['time'])) {
        $fields[] = 'time = ?';
        $params[] = $data['time'];
    }
    if (isset($data['priority'])) {
        $fields[] = 'priority = ?';
        $params[] = $data['priority'];
    }
    if (isset($data['completed'])) {
        $fields[] = 'completed = ?';
        $params[] = $data['completed'] ? 1 : 0;
    }
    if (isset($data['deleted'])) {
        $fields[] = 'deleted = ?';
        $params[] = $data['deleted'] ? 1 : 0;
    }

    if (empty($fields))
        exit;

    $params[] = $id;

    $sql = "UPDATE todos SET " . implode(', ', $fields) . " WHERE id = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    echo json_encode(['success' => true]);
    exit;
}

// Permanently Delete
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!can_edit_todo($pdo, $id, $user_id))
        exit_unauthorized();

    $stmt = $pdo->prepare("DELETE FROM todos WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

function can_edit_todo($pdo, $todo_id, $user_id)
{
    $stmt = $pdo->prepare("SELECT * FROM todos WHERE id = ?");
    $stmt->execute([$todo_id]);
    $todo = $stmt->fetch();

    if (!$todo)
        return false;

    // Personal task: must match user_id
    if (!$todo['group_id'])
        return $todo['user_id'] == $user_id;

    // Group task: must be member of group
    return is_member($pdo, $todo['group_id'], $user_id);
}
?>