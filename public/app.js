// ===================================================
// Firebase Imports
// ===================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

// ===================================================
// Firebase Initialization
// ===================================================
const firebaseConfig = {
  apiKey: "AIzaSyCzxOfchCIdY-j6UNwHGYdou1oRNOW0MOU",
  authDomain: "secret-santa-64c16.firebaseapp.com",
  projectId: "secret-santa-64c16",
  storageBucket: "secret-santa-64c16.firebasestorage.app",
  messagingSenderId: "90650212566",
  appId: "1:90650212566:web:92f5d84ba55d25b20fb177",
  measurementId: "G-NXFPB7Z1VR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===================================================
// UI Helpers
// ===================================================
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

function makeGameCode(len = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ===================================================
// Backend Session → Firebase Bootstrap
// ===================================================
async function getSessionToken() {
  try {
    const res = await fetch("/.netlify/functions/whoami", {
      credentials: "include"
    });
    const data = await res.json();
    return data.firebaseToken || null;
  } catch (err) {
    console.error("[whoami] failed:", err);
    return null;
  }
}

async function getFirebaseUser() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, u => {
      unsub();
      resolve(u);
    });
  });
}

async function ensureFirebaseUser() {
  if (auth.currentUser) return auth.currentUser;

  const token = await getSessionToken();
  if (!token) return null;

  try {
    await signInWithCustomToken(auth, token);
  } catch (err) {
    console.error("signInWithCustomToken failed:", err);
    return null;
  }

  return await getFirebaseUser();
}

async function requireUser() {
  const user = await ensureFirebaseUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// ===================================================
// Route Guard (Loop-Free)
// ===================================================
(async () => {
  const path = window.location.pathname;
  const protectedPages = ["dashboard", "lobby", "reveal"];
  const isProtected = protectedPages.some(p => path.includes(p));
  const isLogin = path.includes("login");

  const token = await getSessionToken();
  const firebaseUser = await ensureFirebaseUser();

  if (isProtected && !token) {
    console.log("[guard] no session cookie → login");
    window.location.href = "login.html";
    return;
  }

  if (isProtected && token && !firebaseUser) {
    console.log("[guard] waiting for firebase user, staying put");
    return;
  }

  if (isLogin && firebaseUser) {
    console.log("[guard] already logged in → dashboard");
    window.location.href = "dashboard.html";
    return;
  }

  console.log("[guard] OK", { path, token, firebaseUser });
})();

// ===================================================
// Login / Logout Buttons
// ===================================================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.onclick = () => {
    window.location.href = "/.netlify/functions/auth-login";
  };
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Firebase signOut error:", e);
    }
    window.location.href = "/.netlify/functions/logout";
  };
}

// ===================================================
// Dashboard: Username Profile
// ===================================================
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const currentUsernameEl = document.getElementById("currentUsername");

if (usernameInput && saveUsernameBtn && currentUsernameEl) {
  (async () => {
    const user = await requireUser();
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists() && snap.data().username) {
      const un = snap.data().username;
      currentUsernameEl.textContent = `Current username: ${un}`;
      usernameInput.value = un;
    } else {
      currentUsernameEl.textContent = "No username set yet.";
    }

    saveUsernameBtn.onclick = async () => {
      const username = usernameInput.value.trim();
      if (!username) return toast("Enter a username.");
      await setDoc(userRef, { username, email: user.email || null }, { merge: true });
      currentUsernameEl.textContent = `Current username: ${username}`;
      toast("Username saved!");
    };
  })();
}

// ===================================================
// Dashboard: Create Game
// ===================================================
const createGameBtn = document.getElementById("createGameBtn");
if (createGameBtn) {
  createGameBtn.onclick = async () => {
    try {
      const user = await requireUser();
      if (!user) return;

      const code = makeGameCode(5);
      const gameRef = await addDoc(collection(db, "games"), {
        code,
        hostId: user.uid,
        hostEmail: user.email || null,
        status: "waiting",
        createdAt: serverTimestamp()
      });

      window.location.href = `lobby.html?id=${gameRef.id}`;
    } catch (err) {
      console.error("Create game failed:", err);
      toast(`Create game failed: ${err.message}`);
    }
  };
}

// ===================================================
// Dashboard: Join Game
// ===================================================
const joinGameBtn = document.getElementById("joinGameBtn");
if (joinGameBtn) {
  joinGameBtn.onclick = async () => {
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
      if (game.status !== "waiting") {
        return toast("That game already started.");
      }

      window.location.href = `lobby.html?id=${gameDoc.id}`;
    } catch (err) {
      console.error("Join game failed:", err);
      toast(`Join game failed: ${err.message}`);
    }
  };
}

// ===================================================
// Lobby: Players + Host Controls
// ===================================================
const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");
const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");
const copyBtn = document.getElementById("copyCodeBtn");

if (gameCodeText && playerListEl) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing game id.");

      const user = await requireUser();
      if (!user) return;

      const gameRef = doc(db, "games", gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) {
        toast("Game not found.");
        return;
      }

      const game = gameSnap.data();
      gameCodeText.textContent = game.code;

      if (copyBtn) {
        copyBtn.onclick = () => copyToClipboard(game.code);
      }

      const profileRef = doc(db, "users", user.uid);
      const profileSnap = await getDoc(profileRef);
      const username = profileSnap.exists() ? profileSnap.data().username || "" : "";

      const playerRef = doc(db, "games", gameId, "players", user.uid);
      await setDoc(playerRef, {
        joinedAt: serverTimestamp(),
        email: user.email || null,
        username
      }, { merge: true });

      const playersCol = collection(db, "games", gameId, "players");
      onSnapshot(playersCol, snap => {
        playerListEl.innerHTML = "";
        snap.forEach(d => {
          const data = d.data();
          const li = document.createElement("li");
          li.textContent = data.username || data.email || d.id;
          playerListEl.appendChild(li);
        });
      });

      if (startGameBtn) {
        const isHost = game.hostId === user.uid;
        if (!isHost) {
          startGameBtn.disabled = true;
          if (hostOnlyNote) hostOnlyNote.textContent = "Only the host can start.";
        } else {
          if (hostOnlyNote) hostOnlyNote.textContent = "You are the host.";
        }

        startGameBtn.onclick = async () => {
          try {
            const latest = await getDoc(gameRef);
            if (!latest.exists()) return;

            if (latest.data().status !== "waiting") {
              toast("Game already started.");
              return;
            }

            const playersSnap = await getDocs(collection(db, "games", gameId, "players"));
            const playerIds = playersSnap.docs.map(d => d.id);
            if (playerIds.length < 3) {
              toast("Need at least 3 players.");
              return;
            }

            const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
            const batch = writeBatch(db);

            for (let i = 0; i < shuffled.length; i++) {
              const giverId = shuffled[i];
              const receiverId = shuffled[(i + 1) % shuffled.length];
              batch.set(doc(db, "assignments", `${gameId}_${giverId}`), {
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
            toast("Game started!");
          } catch (err) {
            console.error("Start game failed:", err);
            toast(`Start game failed: ${err.message}`);
          }
        };
      }
    } catch (err) {
      console.error("Lobby error:", err);
      toast(`Lobby error: ${err.message}`);
    }
  })();
}

// ===================================================
// Lobby: Reveal Button Enable
// ===================================================
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

  const gameRef = doc(db, "games", gameId);
  const first = await getDoc(gameRef);
  if (first.exists() && first.data().status === "started") {
    revealBtn.disabled = false;
    revealStatus.textContent = "Game started! View your assignment.";
  } else {
    revealBtn.disabled = true;
    revealStatus.textContent = "Waiting for host to start...";
  }

  onSnapshot(gameRef, snap => {
    if (!snap.exists()) return;
    const game = snap.data();
    if (game.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! View your assignment.";
    } else {
      revealBtn.disabled = true;
      revealStatus.textContent = "Waiting for host to start...";
    }
  });

  revealBtn.onclick = () => {
    window.location.href = `reveal.html?id=${gameId}`;
  };
})();

// ===================================================
// Reveal Page
// ===================================================
const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing gameId.");

      const user = await requireUser();
      if (!user) return;

      const assignRef = doc(db, "assignments", `${gameId}_${user.uid}`);
      const assignSnap = await getDoc(assignRef);

      if (!assignSnap.exists()) {
        revealText.textContent = "Assignment not found.";
        return;
      }

      const receiverId = assignSnap.data().receiverId;
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
