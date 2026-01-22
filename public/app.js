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
// Session-based Auth (OIDC)
// ===============================
async function fetchUser() {
  try {
    const res = await fetch("/.netlify/functions/whoami", { credentials: "include" });
    const data = await res.json();
    return data.user; // {email, sub, name} or null
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

// compatibility for old code
async function waitForUser() {
  return requireUser();
}


// ===============================
// UI Helpers
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

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getGameIdFromUrl() {
  const p = new URLSearchParams(window.location.search);
  return p.get("id") || p.get("gameId") || "";
}


// ===============================
// Route protection
// ===============================
(async () => {
  const path = window.location.pathname;
  fetchUser().then(user => {
    if (!user) {
      if (path.includes("dashboard") || path.includes("lobby") || path.includes("reveal")) {
        window.location.href = "login.html";
      }
    } else {
      if (path.includes("login")) {
        window.location.href = "dashboard.html";
      }
    }
  });
})();


// ===============================
// LOGIN / LOGOUT BUTTONS
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
// USER PROFILE (Username)
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
// CREATE GAME
// ===============================
function makeGameCode(len = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
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
// JOIN GAME
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
      if (snap.empty) return toast("Game not found.");

      const gameDoc = snap.docs[0];
      const game = gameDoc.data();

      if (game.status !== "waiting") return toast("Game already started.");

      window.location.href = `lobby.html?id=${gameDoc.id}`;
    } catch (err) {
      console.error("Join game failed:", err);
      toast(`Join game failed: ${err.message}`);
    }
  });
}


// ===============================
// LOBBY
// ===============================
const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");
const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");

if (gameCodeText && playerListEl) {
  (async () => {
    const gameId = getGameIdFromUrl();
    if (!gameId) return toast("Missing game id.");

    const user = await requireUser();
    if (!user) return;

    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return toast("Game not found.");

    const game = gameSnap.data();
    gameCodeText.textContent = game.code;

    // join player list
    const profileSnap = await getDoc(doc(db, "users", user.email));
    const username = profileSnap.exists() ? (profileSnap.data().username || "") : "";

    await setDoc(doc(db, "games", gameId, "players", user.email), {
      email: user.email,
      username,
      joinedAt: serverTimestamp()
    }, { merge: true });

    onSnapshot(collection(db, "games", gameId, "players"), snap => {
      playerListEl.innerHTML = "";
      snap.forEach(d => {
        const li = document.createElement("li");
        li.textContent = d.data().username || d.data().email || d.id;
        playerListEl.appendChild(li);
      });
    });

    // start button
    if (startGameBtn) {
      const isHost = game.hostId === user.email;
      if (!isHost) {
        startGameBtn.disabled = true;
        if (hostOnlyNote) hostOnlyNote.textContent = "Only the host can start.";
      } else {
        if (hostOnlyNote) hostOnlyNote.textContent = "You are the host.";
      }

      startGameBtn.addEventListener("click", async () => {
        try {
          const latest = (await getDoc(gameRef)).data();
          if (latest.status !== "waiting") return toast("Game already started.");

          const playerSnap = await getDocs(collection(db, "games", gameId, "players"));
          const playerIds = playerSnap.docs.map(d => d.id);
          if (playerIds.length < 3) return toast("Need at least 3 players.");

          const shuffled = playerIds.sort(() => Math.random() - 0.5);
          const batch = writeBatch(db);

          for (let i = 0; i < shuffled.length; i++) {
            const giver = shuffled[i];
            const receiver = shuffled[(i + 1) % shuffled.length];
            batch.set(doc(db, "assignments", `${gameId}_${giver}`), {
              gameId,
              giverId: giver,
              receiverId: receiver,
              createdAt: serverTimestamp()
            });
          }

          batch.update(gameRef, {
            status: "started",
            startedAt: serverTimestamp()
          });

          await batch.commit();
          toast("Game started!");
        } catch (err) {
          console.error("Start game failed:", err);
          toast(`Start failed: ${err.message}`);
        }
      });
    }
  })();
}


// ===============================
// REVEAL
// ===============================
const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    const gameId = getGameIdFromUrl();
    if (!gameId) return toast("Missing game id.");

    const user = await requireUser();
    if (!user) return;

    const assignRef = doc(db, "assignments", `${gameId}_${user.email}`);
    const assignSnap = await getDoc(assignRef);

    if (!assignSnap.exists()) {
      revealText.textContent = "Assignment not found.";
      return;
    }

    const { receiverId } = assignSnap.data();
    const recSnap = await getDoc(doc(db, "users", receiverId));
    const name = recSnap.exists() && recSnap.data().username ? recSnap.data().username : receiverId;

    revealText.textContent = `You are buying for: ${name}`;
  })();
}


// ===============================
// LOBBY → REVEAL BUTTON
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

  revealBtn.addEventListener("click", () => {
    window.location.href = `reveal.html?id=${gameId}`;
  });

  revealBtn.disabled = true;
  revealStatus.textContent = "Waiting for host to start...";

  onSnapshot(doc(db, "games", gameId), snap => {
    if (!snap.exists()) return;
    const game = snap.data();
    if (game.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! Reveal your assignment.";
    }
  });
})();
