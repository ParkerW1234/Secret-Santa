// public/app.js

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
async function fetchUser() {
  try {
    const res = await fetch("/.netlify/functions/whoami", {
      credentials: "include"
    });
    const data = await res.json();
    return data.user; // { email, sub, name } or null
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

  const protectedPath =
    path.includes("dashboard") ||
    path.includes("lobby") ||
    path.includes("reveal");

  if (!user && protectedPath) {
    window.location.href = "login.html";
    return;
  }

  if (user && path.includes("login")) {
    window.location.href = "dashboard.html";
    return;
  }
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
// Username profile
// ===============================
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const currentUsernameEl = document.getElementById("currentUsername");

if (usernameInput && saveUsernameBtn && currentUsernameEl) {
  (async () => {
    const user = await requireUser();
    if (!user) return;

    const userRef = doc(db, "users", user.email);
    const snap = await getDoc(userRef);

    if (snap.exists() && snap.data().username) {
      currentUsernameEl.textContent = `Current username: ${snap.data().username}`;
      usernameInput.value = snap.data().username;
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
// Game creation
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
        hostId: user.email,
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
// Join game
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
// Lobby (players list + host controls)
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

      // Add current user to players collection
      const profileSnap = await getDoc(doc(db, "users", user.email));
      const username = profileSnap.exists()
        ? profileSnap.data().username || ""
        : "";

      await setDoc(
        doc(db, "games", gameId, "players", user.email),
        {
          joinedAt: serverTimestamp(),
          email: user.email,
          username
        },
        { merge: true }
      );

      // Live player list
      onSnapshot(collection(db, "games", gameId, "players"), (snap) => {
        playerListEl.innerHTML = "";
        snap.forEach((d) => {
          const li = document.createElement("li");
          li.textContent = d.data().username || d.data().email || d.id;
          playerListEl.appendChild(li);
        });
      });

      // Start game (host only)
      if (startGameBtn) {
        const isHost = game.hostId === user.email;

        if (!isHost) {
          startGameBtn.disabled = true;
          if (hostOnlyNote)
            hostOnlyNote.textContent = "Only the host can start the game.";
        } else {
          if (hostOnlyNote) hostOnlyNote.textContent = "You are the host.";
        }

        startGameBtn.addEventListener("click", async () => {
          try {
            const latestSnap = await getDoc(gameRef);
            const latest = latestSnap.data();
            if (latest.status !== "waiting") {
              return toast("Game has already started.");
            }

            const playersSnap = await getDocs(
              collection(db, "games", gameId, "players")
            );
            const playerIds = playersSnap.docs.map((d) => d.id);

            if (playerIds.length < 3) {
              return toast("At least 3 players are required.");
            }

            const shuffled = [...playerIds].sort(
              () => Math.random() - 0.5
            );
            const batch = writeBatch(db);

            for (let i = 0; i < shuffled.length; i++) {
              const giverId = shuffled[i];
              const receiverId = shuffled[(i + 1) % shuffled.length];

              batch.set(
                doc(db, "assignments", `${gameId}_${giverId}`),
                {
                  gameId,
                  giverId,
                  receiverId,
                  createdAt: serverTimestamp()
                }
              );
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

      const receiverSnap = await getDoc(doc(db, "users", receiverId));
      const receiverName =
        receiverSnap.exists() && receiverSnap.data().username
          ? receiverSnap.data().username
          : "Your assigned person";

      revealText.textContent = `You are buying for: ${receiverName}`;
    } catch (err) {
      console.error("Reveal error:", err);
      toast(`Reveal error: ${err.message}`);
    }
  })();
}

// ===============================
// Lobby "reveal" button behavior
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
  if (first.exists()) {
    const g = first.data();
    if (g.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent =
        "Game started! Click to view your assignment.";
    }
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

