// app.ts
// Wichtig: Es wird an keiner Stelle innerHTML / insertAdjacentHTML verwendet.
// Alle Texte werden per textContent gesetzt bzw. Elemente per createElement
// erzeugt. Dadurch können vom Nutzer eingegebene Werte (z.B. Benutzername)
// niemals als HTML/JS interpretiert werden -> keine Code-Injection möglich.

interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

interface CurrentUser {
  id: number;
  username: string;
  email: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

const API_URL = "backend.php";

// --- Login-Elemente ---
const loginCard = document.getElementById("login-card") as HTMLDivElement;
const loginForm = document.getElementById("login-form") as HTMLFormElement;
const loginUsernameInput = document.getElementById("login-username") as HTMLInputElement;
const loginPasswordInput = document.getElementById("login-password") as HTMLInputElement;
const loginMessageEl = document.getElementById("login-message") as HTMLDivElement;

// --- Eingeloggt-Anzeige ---
const loggedInCard = document.getElementById("logged-in-card") as HTMLDivElement;
const loggedInAsEl = document.getElementById("logged-in-as") as HTMLSpanElement;
const logoutBtn = document.getElementById("logout-btn") as HTMLButtonElement;

// --- Registrierung (immer sichtbar) ---
const form = document.getElementById("user-form") as HTMLFormElement;
const usernameInput = document.getElementById("username") as HTMLInputElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const passwordInput = document.getElementById("password") as HTMLInputElement;
const messageEl = document.getElementById("message") as HTMLDivElement;

// --- Nutzerliste (nur eingeloggt sichtbar) ---
const userListCard = document.getElementById("user-list-card") as HTMLDivElement;
const userListEl = document.getElementById("user-list") as HTMLDivElement;

function setMessage(el: HTMLDivElement, text: string, kind: "success" | "error"): void {
  // textContent statt innerHTML -> kein HTML-Parsing des Textes
  el.textContent = text;
  el.classList.remove("success", "error");
  el.classList.add(kind);
}

function clearMessage(el: HTMLDivElement): void {
  el.textContent = "";
  el.classList.remove("success", "error");
}

/**
 * Schaltet die Ansicht auf "eingeloggt": Login-Formular ausblenden,
 * Logout-Leiste und Nutzerliste einblenden.
 */
function showApp(user: CurrentUser): void {
  loginCard.hidden = true;
  loggedInCard.hidden = false;
  userListCard.hidden = false;
  loggedInAsEl.textContent = `Angemeldet als ${user.username} Email: ${user.email}`;
}

/**
 * Schaltet zurück auf "ausgeloggt": Login-Formular einblenden,
 * Logout-Leiste und Nutzerliste ausblenden.
 */
function showLogin(): void {
  loginCard.hidden = false;
  loggedInCard.hidden = true;
  userListCard.hidden = true;
}

/**
 * Rendert die Nutzerliste ausschließlich über DOM-Methoden.
 * Kein innerHTML, kein Zusammenbauen von HTML-Strings.
 */
function renderUsers(users: User[]): void {
  // Bestehende Kindknoten sicher entfernen (kein innerHTML = "")
  while (userListEl.firstChild) {
    userListEl.removeChild(userListEl.firstChild);
  }

  if (users.length === 0) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Noch keine Nutzer vorhanden.";
    userListEl.appendChild(hint);
    return;
  }

  for (const user of users) {
    const item = document.createElement("div");
    item.className = "user-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "username";
    nameSpan.textContent = user.username; // sicher: wird als reiner Text gesetzt

    const emailSpan = document.createElement("span");
    emailSpan.className = "email";
    emailSpan.textContent = user.email; // sicher: wird als reiner Text gesetzt

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Löschen";
    deleteBtn.addEventListener("click", () => {
      void deleteUser(user.id);
    });

    item.appendChild(nameSpan);
    item.appendChild(emailSpan);
    item.appendChild(deleteBtn);
    userListEl.appendChild(item);
  }
}

async function loadUsers(): Promise<void> {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      credentials: "same-origin", // Session-Cookie mitschicken
    });
    const result = (await response.json()) as ApiResponse<User[]>;

    if (!result.success) {
      // Falls die Session inzwischen abgelaufen ist, zurück zum Login
      showLogin();
      return;
    }

    renderUsers(result.data);
  } catch (err) {
    setMessage(messageEl, "Nutzerliste konnte nicht geladen werden.", "error");
  }
}

async function createUser(username: string, email: string, password: string): Promise<void> {
  const response = await fetch(API_URL, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    // JSON.stringify escaped die Werte korrekt -> kein manuelles String-Bauen
    body: JSON.stringify({ username, email, password }),
  });

  const result = (await response.json()) as ApiResponse<User>;

  if (!result.success) {
    setMessage(messageEl, result.error, "error");
    return;
  }

  setMessage(messageEl, `Nutzer "${result.data.username}" wurde angelegt.`, "success");
  form.reset();

  // Falls man selbst gerade eingeloggt ist, Liste direkt aktualisieren
  if (!userListCard.hidden) {
    await loadUsers();
  }
}

async function deleteUser(id: number): Promise<void> {
  const response = await fetch(`${API_URL}?id=${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });

  const result = (await response.json()) as ApiResponse<null>;

  if (!result.success) {
    setMessage(messageEl, result.error, "error");
    return;
  }

  await loadUsers();
}

/**
 * Prüft beim Laden der Seite, ob bereits eine gültige Session existiert.
 */
async function checkSession(): Promise<void> {
  try {
    const response = await fetch(`${API_URL}?action=me`, {
      method: "GET",
      credentials: "same-origin",
    });
    const result = (await response.json()) as ApiResponse<CurrentUser>;

    if (result.success) {
      showApp(result.data);
      await loadUsers();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

async function login(username: string, password: string): Promise<void> {
  const response = await fetch(`${API_URL}?action=login`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const result = (await response.json()) as ApiResponse<CurrentUser>;

  if (!result.success) {
    setMessage(loginMessageEl, result.error, "error");
    return;
  }

  clearMessage(loginMessageEl);
  loginForm.reset();
  showApp(result.data);
  await loadUsers();
}

async function logout(): Promise<void> {
  await fetch(`${API_URL}?action=logout`, {
    method: "POST",
    credentials: "same-origin",
  });

  showLogin();
}

// --- Event-Listener ---

loginForm.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  clearMessage(loginMessageEl);

  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  if (username.length === 0 || password.length === 0) {
    setMessage(loginMessageEl, "Bitte Benutzername und Passwort angeben.", "error");
    return;
  }

  void login(username, password);
});

logoutBtn.addEventListener("click", () => {
  void logout();
});

form.addEventListener("submit", (event: SubmitEvent) => {
  event.preventDefault();
  clearMessage(messageEl);

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (username.length < 3) {
    setMessage(messageEl, "Benutzername muss mindestens 3 Zeichen lang sein.", "error");
    return;
  }
  if (!email.includes("@")) {
    setMessage(messageEl, "Bitte eine gültige E-Mail-Adresse angeben.", "error");
    return;
  }
  if (password.length < 8) {
    setMessage(messageEl, "Passwort muss mindestens 8 Zeichen lang sein.", "error");
    return;
  }

  void createUser(username, email, password);
});

// Beim Start: Session prüfen
void checkSession();
