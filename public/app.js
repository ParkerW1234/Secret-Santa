// ===============================
// Firebase (Firestore only)
// ===============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("app.js loaded on:", window.location.href);

const firebaseConfig = {
  apiKey: "AIzaSyCzxOfchCIdY-j6UNwHGYdou1oRNOW0MOU",
  authDomain: "secret-santa-64c16.firebaseapp.com",
  projectId: "secret-santa-64c16",
  storageBucket: "secret-santa-64c16.firebasestorage.app",
  messagingSenderId: "90650212566",
  appId: "1:90650212566:web:92f5d84ba55d25b20fb177",
  measurementId: "G-NXFPB7Z1VR"
};

initializeApp(firebaseConfig);
const db = getFirestore();

// ===============================
// Auth helpers (Netlify + whoami)
// ===============================

/**
 * Normalizes whatever /whoami returns into:
 *   { email, sub, name } or null
 *
 * Supports both:
 *   { user: { ... } }
 * and:
 *   { iss, sub, email, ... }
 */
function normalizeUserPayload(data) {
  if (!data) return null;

  // Shape 1: { user: { ... } }
  if (data.user) {
    const u = data.user;
    return {
      email: u.email || null,
      sub: u.sub || u.id || null,
      name: u.name || u.email || u.sub || null
    };
  }

  // Shape 2: naked token { iss, sub, email, ... }
  if (data.sub || data.email || data.iss) {
    return {
      email: data.email || null,
      sub: data.sub || null,
      name: data.name || data.email || data.sub || null
    };
  }

  return null;
}

async function fetchUser() {
  try {
    const res = await fetch("/.netlify/functions/whoami", {
      credentials: "include"
    });
    const data = await res.json();
    const user = normalizeUserPayload(data);
    return user; // or null
  } catch (err) {
    console.error("fetchUser failed:", err);
    return null;
  }
}

async function requireUser() {
  const user = await fetchUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// compatibility shim for any old usage
async function waitForUser() {
  return requireUser();
}

// ===============================
// UI helpers
// ===============================
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied!");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copied!");
  }
}

function getGameIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("gameId") || "";
}

// ===============================
// Route protection
// ===============================
(async () => {
  const path = window.location.pathname;
  const user = await fetchUser();

  const isProtected =
    path.includes("dashboard") ||
    path.includes("lobby") ||
    path.includes("reveal");

  if (!user && isProtected) {
    console.log("[guard] not logged in, redirecting to login");
    window.location.href = "login.html";
    return;
  }

  if (user && path.includes("login")) {
    console.log("[guard] already logged in, redirecting to dashboard");
    window.location.href = "dashboard.html";
    return;
  }

  console.log("[guard] path:", path, "user:", user);
})();

// ===============================
// Login / Logout buttons
// ===============================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    window.location.href = "/.netlify/functions/auth-login";
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    window.location.href = "/.netlify/functions/logout";
  });
}

// ===============================
// Username profile (Dashboard)
// ===============================
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const currentUsernameEl = document.getElementById("currentUsername");

if (usernameInput && saveUsernameBtn && currentUsernameEl) {
  (async () => {
    const user = await requireUser();
    if (!user) return;

    // We key users by email (your choice A)
    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);

    if (snap.exists() && snap.data().username) {
      const un = snap.data().username;
      currentUsernameEl.textContent = `Current username: ${un}`;
      usernameInput.value = un;
    } else {
      currentUsernameEl.textContent = "No username set yet.";
    }

    saveUsernameBtn.addEventListener("click", async () => {
      const username = usernameInput.value.trim();
      if (!username) return toast("Enter a username.");

      await setDoc(userRef, { username }, { merge: true });
      currentUsernameEl.textContent = `Current username: ${username}`;
      toast("Username saved!");
    });
  })();
}

// ===============================
// Game creation (Dashboard)
// ===============================
function makeGameCode(len = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const createGameBtn = document.getElementById("createGameBtn");
if (createGameBtn) {
  createGameBtn.addEventListener("click", async () => {
    try {
      const user = await requireUser();
      if (!user) return;

      const code = makeGameCode(5);
      const gameRef = await addDoc(collection(db, "games"), {
        code,
        hostId: user.email,    // host id by email
        status: "waiting",
        createdAt: serverTimestamp()
      });

      window.location.href = `lobby.html?id=${gameRef.id}`;
    } catch (err) {
      console.error("Create game failed:", err);
      toast(`Create game failed: ${err.message}`);
    }
  });
}

// ===============================
// Join game (Dashboard)
// ===============================
const joinGameBtn = document.getElementById("joinGameBtn");
if (joinGameBtn) {
  joinGameBtn.addEventListener("click", async () => {
    try {
      const user = await requireUser();
      if (!user) return;

      const codeEl = document.getElementById("gameCode");
      const code = codeEl?.value?.trim()?.toUpperCase();
      if (!code) return toast("Enter a game code.");

      const q = query(collection(db, "games"), where("code", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) return toast("Game not found. Check the code.");

      const gameDoc = snap.docs[0];
      const game = gameDoc.data();

      if (game.status !== "waiting") {
        return toast("That game has already started.");
      }

      window.location.href = `lobby.html?id=${gameDoc.id}`;
    } catch (err) {
      console.error("Join game failed:", err);
      toast(`Join game failed: ${err.message}`);
    }
  });
}

// ===============================
// Lobby (players list + join / host logic)
// ===============================
const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");
const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");

if (gameCodeText && playerListEl) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing game id in URL.");

      const user = await requireUser();
      if (!user) return;

      const gameRef = doc(db, "games", gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return toast("Game not found.");

      const game = gameSnap.data();
      gameCodeText.textContent = game.code;

      // Add current user to this game's players subcollection
      const userProfileSnap = await getDoc(doc(db, "users", user.email));
      const username = userProfileSnap.exists()
        ? userProfileSnap.data().username || ""
        : "";

      const playerRef = doc(db, "games", gameId, "players", user.email);
      await setDoc(
        playerRef,
        {
          joinedAt: serverTimestamp(),
          email: user.email,
          username
        },
        { merge: true }
      );

      // Live players list
      const playersCol = collection(db, "games", gameId, "players");
      onSnapshot(playersCol, (snap) => {
        playerListEl.innerHTML = "";
        snap.forEach((d) => {
          const data = d.data();
          const li = document.createElement("li");
          li.textContent = data.username || data.email || d.id;
          playerListEl.appendChild(li);
        });
      });

      // Host-only "Start game" button
      if (startGameBtn) {
        const isHost = game.hostId === user.email;

        if (!isHost) {
          startGameBtn.disabled = true;
          if (hostOnlyNote) {
            hostOnlyNote.textContent = "Only the host can start the game.";
          }
        } else {
          if (hostOnlyNote) {
            hostOnlyNote.textContent = "You are the host.";
          }
        }

        startGameBtn.addEventListener("click", async () => {
          try {
            const latestSnap = await getDoc(gameRef);
            if (!latestSnap.exists()) {
              return toast("Game not found.");
            }

            const latest = latestSnap.data();
            if (latest.status !== "waiting") {
              return toast("Game has already started.");
            }

            const playersSnap = await getDocs(
              collection(db, "games", gameId, "players")
            );
            const playerIds = playersSnap.docs.map((d) => d.id);

            if (playerIds.length < 3) {
              return toast("At least 3 players are required to start.");
            }

            // Shuffle players to assign
            const shuffled = [...playerIds].sort(
              () => Math.random() - 0.5
            );
            const batch = writeBatch(db);

            for (let i = 0; i < shuffled.length; i++) {
              const giverId = shuffled[i];
              const receiverId = shuffled[(i + 1) % shuffled.length];

              const assignRef = doc(
                db,
                "assignments",
                `${gameId}_${giverId}`
              );
              batch.set(assignRef, {
                gameId,
                giverId,
                receiverId,
                createdAt: serverTimestamp()
              });
            }

            batch.update(gameRef, {
              status: "started",
              startedAt: serverTimestamp()
            });

            await batch.commit();
            toast("Game started! Go to the reveal page to see your assignment.");
          } catch (err) {
            console.error("Start game failed:", err);
            toast(`Start game failed: ${err.message}`);
          }
        });
      }
    } catch (err) {
      console.error("Lobby error:", err);
      toast(`Lobby error: ${err.message}`);
    }
  })();
}

// ===============================
// Reveal page
// ===============================
const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing gameId in URL.");

      const user = await requireUser();
      if (!user) return;

      const assignRef = doc(db, "assignments", `${gameId}_${user.email}`);
      const assignSnap = await getDoc(assignRef);

      if (!assignSnap.exists()) {
        revealText.textContent =
          "Assignment not found. Are you sure the game has started?";
        return;
      }

      const { receiverId } = assignSnap.data();

      const reciverSnap = await getDoc(doc(db, "users", receiverId));
      const receiverName =
        reciverSnap.exists() && reciverSnap.data().username
          ? reciverSnap.data().username
          : "Your assigned person";

      revealText.textContent = `You are buying for: ${receiverName}`;
    } catch (err) {
      console.error("Reveal error:", err);
      toast(`Reveal error: ${err.message}`);
    }
  })();
}

// ===============================
// Lobby → Reveal button auto-enable
// ===============================
(async () => {
  if (!window.location.pathname.includes("lobby")) return;

  const revealBtn = document.getElementById("revealBtn");
  const revealStatus = document.getElementById("revealStatus");
  if (!revealBtn || !revealStatus) return;

  const gameId = getGameIdFromUrl();
  if (!gameId) {
    revealBtn.disabled = true;
    revealStatus.textContent = "Missing game id.";
    return;
  }

  revealBtn.disabled = true;
  revealStatus.textContent = "Waiting for host to start the game...";

  const gameRef = doc(db, "games", gameId);

  const first = await getDoc(gameRef);
  if (first.exists() && first.data().status === "started") {
    revealBtn.disabled = false;
    revealStatus.textContent =
      "Game started! Click to view your assignment.";
  }

  onSnapshot(gameRef, (snap) => {
    if (!snap.exists()) return;
    const game = snap.data();

    if (game.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent =
        "Game started! Click to view your assignment.";
    } else {
      revealBtn.disabled = true;
      revealStatus.textContent =
        "Waiting for host to start the game...";
    }
  });

  revealBtn.addEventListener("click", () => {
    window.location.href = `reveal.html?id=${gameId}`;
  });
})();

// ===============================
// Copy game code button (if present)
// ===============================
const copyBtn = document.getElementById("copyCodeBtn");
if (copyBtn && gameCodeText) {
  copyBtn.onclick = () =>
    copyToClipboard(gameCodeText.textContent || "");
}
