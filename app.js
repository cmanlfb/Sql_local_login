"use strict";
// app.ts
// Wichtig: Es wird an keiner Stelle innerHTML / insertAdjacentHTML verwendet.
// Alle Texte werden per textContent gesetzt bzw. Elemente per createElement
// erzeugt. Dadurch können vom Nutzer eingegebene Werte (z.B. Benutzername)
// niemals als HTML/JS interpretiert werden -> keine Code-Injection möglich.
const API_URL = "backend.php";
// --- Login-Elemente ---
const loginCard = document.getElementById("login-card");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const loginMessageEl = document.getElementById("login-message");
// --- Eingeloggt-Anzeige ---
const loggedInCard = document.getElementById("logged-in-card");
const loggedInAsEl = document.getElementById("logged-in-as");
const logoutBtn = document.getElementById("logout-btn");
// --- Registrierung (immer sichtbar) ---
const form = document.getElementById("user-form");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const messageEl = document.getElementById("message");
// --- Nutzerliste (nur eingeloggt sichtbar) ---
const userListCard = document.getElementById("user-list-card");
const userListEl = document.getElementById("user-list");
function setMessage(el, text, kind) {
    // textContent statt innerHTML -> kein HTML-Parsing des Textes
    el.textContent = text;
    el.classList.remove("success", "error");
    el.classList.add(kind);
}
function clearMessage(el) {
    el.textContent = "";
    el.classList.remove("success", "error");
}
/**
 * Schaltet die Ansicht auf "eingeloggt": Login-Formular ausblenden,
 * Logout-Leiste und Nutzerliste einblenden.
 */
function showApp(user) {
    loginCard.hidden = true;
    loggedInCard.hidden = false;
    userListCard.hidden = false;
    loggedInAsEl.textContent = `Angemeldet als ${user.username} Email: ${user.email}`;
}
/**
 * Schaltet zurück auf "ausgeloggt": Login-Formular einblenden,
 * Logout-Leiste und Nutzerliste ausblenden.
 */
function showLogin() {
    loginCard.hidden = false;
    loggedInCard.hidden = true;
    userListCard.hidden = true;
}
/**
 * Rendert die Nutzerliste ausschließlich über DOM-Methoden.
 * Kein innerHTML, kein Zusammenbauen von HTML-Strings.
 */
function renderUsers(users) {
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
async function loadUsers() {
    try {
        const response = await fetch(API_URL, {
            method: "GET",
            credentials: "same-origin", // Session-Cookie mitschicken
        });
        const result = (await response.json());
        if (!result.success) {
            // Falls die Session inzwischen abgelaufen ist, zurück zum Login
            showLogin();
            return;
        }
        renderUsers(result.data);
    }
    catch (err) {
        setMessage(messageEl, "Nutzerliste konnte nicht geladen werden.", "error");
    }
}
async function createUser(username, email, password) {
    const response = await fetch(API_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
        // JSON.stringify escaped die Werte korrekt -> kein manuelles String-Bauen
        body: JSON.stringify({ username, email, password }),
    });
    const result = (await response.json());
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
async function deleteUser(id) {
    const response = await fetch(`${API_URL}?id=${id}`, {
        method: "DELETE",
        credentials: "same-origin",
    });
    const result = (await response.json());
    if (!result.success) {
        setMessage(messageEl, result.error, "error");
        return;
    }
    await loadUsers();
}
/**
 * Prüft beim Laden der Seite, ob bereits eine gültige Session existiert.
 */
async function checkSession() {
    try {
        const response = await fetch(`${API_URL}?action=me`, {
            method: "GET",
            credentials: "same-origin",
        });
        const result = (await response.json());
        if (result.success) {
            showApp(result.data);
            await loadUsers();
        }
        else {
            showLogin();
        }
    }
    catch (err) {
        showLogin();
    }
}
async function login(username, password) {
    const response = await fetch(`${API_URL}?action=login`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
    });
    const result = (await response.json());
    if (!result.success) {
        setMessage(loginMessageEl, result.error, "error");
        return;
    }
    clearMessage(loginMessageEl);
    loginForm.reset();
    showApp(result.data);
    await loadUsers();
}
async function logout() {
    await fetch(`${API_URL}?action=logout`, {
        method: "POST",
        credentials: "same-origin",
    });
    showLogin();
}
// --- Event-Listener ---
loginForm.addEventListener("submit", (event) => {
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
form.addEventListener("submit", (event) => {
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
