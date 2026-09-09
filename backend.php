<?php
// backend.php
// Einfaches Backend mit SQLite (PDO). Alle Queries verwenden ausschließlich
// prepared statements mit gebundenen Parametern -> keine SQL-Injection möglich,
// auch nicht bei böswillig gestalteten Eingaben.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

const DB_FILE = __DIR__ . '/users.sqlite';

function send(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function getPdo(): PDO
{
    $pdo = new PDO('sqlite:' . DB_FILE);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Tabelle bei Bedarf anlegen. UNIQUE-Constraints verhindern doppelte
    // Benutzernamen/E-Mails bereits auf DB-Ebene.
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime(\'now\'))
        )
    ');

    return $pdo;
}

session_set_cookie_params([
    'httponly' => true,   // Cookie ist per JavaScript nicht auslesbar (schützt vor XSS-Diebstahl)
    'samesite' => 'Lax',  // Schutz vor CSRF bei Cross-Site-Requests
    'secure'   => false,  // WICHTIG: auf true setzen, sobald du HTTPS nutzt (Produktion!)
]);
session_start();

try {
    $pdo = getPdo();
} catch (PDOException $e) {
    send(['success' => false, 'error' => 'Datenbank nicht erreichbar.'], 500);
}

$method = $_SERVER['REQUEST_METHOD'];

// Login
if ($method === 'POST' && ($_GET['action'] ?? '') === 'login') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');

    $stmt = $pdo->prepare('SELECT id, username, password_hash FROM users WHERE username = :username');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    // Bewusst dieselbe Fehlermeldung bei falschem Namen ODER falschem Passwort,
    // damit ein Angreifer nicht herausfinden kann, ob ein Username existiert.
    if (!$user || !password_verify($password, $user['password_hash'])) {
        send(['success' => false, 'error' => 'Benutzername oder Passwort falsch.'], 401);
    }

    // Session-ID neu generieren gegen Session-Fixation-Angriffe
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];

    send(['success' => true, 'data' => ['id' => $user['id'], 'username' => $user['username']]]);
}

// Logout
if ($method === 'POST' && ($_GET['action'] ?? '') === 'logout') {
    $_SESSION = [];
    session_destroy();
    send(['success' => true]);
}

// Aktuellen Login-Status abfragen
if ($method === 'GET' && ($_GET['action'] ?? '') === 'me') {
    if (isset($_SESSION['user_id'])) {
        send(['success' => true, 'data' => ['id' => $_SESSION['user_id'], 'username' => $_SESSION['username']]]);
    }
    send(['success' => false, 'error' => 'Nicht eingeloggt.'], 401);
}

// Nutzerliste laden (nur eingeloggte Nutzer)
if ($method === 'GET' && !isset($_GET['action'])) {
    if (!isset($_SESSION['user_id'])) {
        send(['success' => false, 'error' => 'Nicht eingeloggt.'], 401);
    }

    // Passwort-Hash wird bewusst NICHT zurückgegeben.
    $stmt = $pdo->query('SELECT id, username, email, created_at FROM users ORDER BY id DESC');
    $users = $stmt->fetchAll();

    send(['success' => true, 'data' => $users]);
}

// Neuen Nutzer registrieren
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    if (!is_array($input)) {
        send(['success' => false, 'error' => 'Ungültige Anfrage.'], 400);
    }

    $username = trim((string)($input['username'] ?? ''));
    $email    = trim((string)($input['email'] ?? ''));
    $password = (string)($input['password'] ?? '');

    // Serverseitige Validierung (clientseitige Validierung im Frontend
    // ersetzt niemals die serverseitige Prüfung).
    // strlen() statt mb_strlen(): keine mbstring-Extension nötig.
    if (strlen($username) < 3 || strlen($username) > 50) {
        send(['success' => false, 'error' => 'Benutzername muss 3-50 Zeichen lang sein.'], 422);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send(['success' => false, 'error' => 'Ungültige E-Mail-Adresse.'], 422);
    }
    if (strlen($password) < 8) {
        send(['success' => false, 'error' => 'Passwort muss mindestens 8 Zeichen lang sein.'], 422);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);

    try {
        // Prepared statement mit benannten Platzhaltern: Eingaben werden
        // von PDO als reine Daten übergeben, nie als SQL-Code interpretiert.
        $stmt = $pdo->prepare(
            'INSERT INTO users (username, email, password_hash) VALUES (:username, :email, :password_hash)'
        );
        $stmt->execute([
            ':username'      => $username,
            ':email'         => $email,
            ':password_hash' => $passwordHash,
        ]);

        $id = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare('SELECT id, username, email, created_at FROM users WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();

        send(['success' => true, 'data' => $user], 201);
    } catch (PDOException $e) {
        // Verletzung des UNIQUE-Constraints o.ä. -> generische Fehlermeldung,
        // interne Details (z.B. DB-Struktur) werden nicht an den Client geleakt.
        send(['success' => false, 'error' => 'Benutzername oder E-Mail bereits vergeben.'], 409);
    }
}

// Nutzer löschen (nur eingeloggte Nutzer)
if ($method === 'DELETE') {
    if (!isset($_SESSION['user_id'])) {
        send(['success' => false, 'error' => 'Nicht eingeloggt.'], 401);
    }

    // Die ID kommt bei DELETE meist als Query-Parameter: /backend.php?id=5
    $id = (int)($_GET['id'] ?? 0);

    if ($id <= 0) {
        send(['success' => false, 'error' => 'Ungültige ID.'], 400);
    }

    $stmt = $pdo->prepare('DELETE FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        send(['success' => false, 'error' => 'Nutzer nicht gefunden.'], 404);
    }

    send(['success' => true]);
}

send(['success' => false, 'error' => 'Methode nicht erlaubt.'], 405);
