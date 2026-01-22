// ===============================
// Firebase Initialization
// ===============================
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

// ===============================
// Backend Session → Firebase Auth
// ===============================

/**
 * Calls Netlify /.netlify/functions/whoami
 * Expected response:
 * {
 *   user: { sub, email, name, ... } | null,
 *   firebaseToken: "..." | null
 * }
 */
async function fetchSession() {
  try {
    const res = await fetch("/.netlify/functions/whoami", {
      credentials: "include"
    });
    const data = await res.json();
    return data || { user: null, firebaseToken: null };
  } catch (err) {
    console.error("fetchSession failed:", err);
    return { user: null, firebaseToken: null };
  }
}

/**
 * Ensures Firebase Auth user is signed in using the backend-provided
 * custom token (firebaseToken). Returns the Firebase user or null.
 */
async function ensureFirebaseUserFromSession() {
  // Already signed in
  if (auth.currentUser) return auth.currentUser;

  const session = await fetchSession();
  const { user, firebaseToken } = session;

  if (!user || !firebaseToken) {
    return null;
  }

  try {
    await signInWithCustomToken(auth, firebaseToken);
  } catch (err) {
    console.error("signInWithCustomToken failed:", err);
    return null;
  }

  // Wait for onAuthStateChanged to fire
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      unsub();
      resolve(u);
    });
  });
}

/**
 * Guard used for protected pages. If user isn't logged in both
 * in backend session (Hack Club) and Firebase, redirect to login.
 */
async function requireUser() {
  const firebaseUser = await ensureFirebaseUserFromSession();
  if (!firebaseUser) {
    window.location.href = "login.html";
    return null;
  }
  return firebaseUser;
}

// ===============================
// Route Guard (per-page behavior)
// ===============================
(async () => {
  const path = window.location.pathname;

  const isProtected =
    path.includes("dashboard") ||
    path.includes("lobby") ||
    path.includes("reveal");

  const isLogin = path.includes("login");

  // If we're on a protected page, require user.
  if (isProtected) {
    const u = await requireUser();
    if (!u) return; // redirected
    console.log("[guard] protected page, logged in as:", u.email);
  } else if (isLogin) {
    // On login page: if we already have a Firebase user from session, go to dashboard.
    const firebaseUser = await ensureFirebaseUserFromSession();
    if (firebaseUser) {
      console.log("[guard] already signed in, redirecting to dashboard");
      window.location.href = "dashboard.html";
      return;
    } else {
      console.log("[guard] on login page, no user (yet)");
    }
  } else {
    console.log("[guard] public page:", path);
  }
})();

// ===============================
// Login / Logout Buttons
// ===============================
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    // Hand off to Netlify + Hack Club Auth
    window.location.href = "/.netlify/functions/auth-login";
  });
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Firebase signOut failed (maybe not signed in):", e);
    }
    window.location.href = "/.netlify/functions/logout";
  });
}

// ===============================
// Dashboard: Profile (username)
// ===============================
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const currentUsernameEl = document.getElementById("currentUsername");

if (usernameInput && saveUsernameBtn && currentUsernameEl) {
  (async () => {
    const user = await requireUser();
    if (!user) return;

    const userRef = doc(db, "users", user.uid); // uid = Hack Club sub via custom token
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

      await setDoc(userRef, { username, email: user.email || null }, { merge: true });
      currentUsernameEl.textContent = `Current username: ${username}`;
      toast("Username saved!");
    });
  })();
}

// ===============================
// Dashboard: Create Game
// ===============================
const createGameBtn = document.getElementById("createGameBtn");
if (createGameBtn) {
  createGameBtn.addEventListener("click", async () => {
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
      toast(`Create game failed: ${err.message || err.code || "Error"}`);
    }
  });
}

// ===============================
// Dashboard: Join Game
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
      toast(`Join game failed: ${err.message || err.code || "Error"}`);
    }
  });
}

// ===============================
// Lobby: Players list + host controls
// ===============================
const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");
const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");
const copyBtn = document.getElementById("copyCodeBtn");

if (gameCodeText && playerListEl) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) {
        toast("Missing game id in URL.");
        return;
      }

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

      // Attach current user as player
      const userProfileRef = doc(db, "users", user.uid);
      const userProfileSnap = await getDoc(userProfileRef);
      const username = userProfileSnap.exists()
        ? userProfileSnap.data().username || ""
        : "";

      const playerRef = doc(db, "games", gameId, "players", user.uid);
      await setDoc(
        playerRef,
        {
          joinedAt: serverTimestamp(),
          email: user.email || null,
          username
        },
        { merge: true }
      );

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

      // Host-only start control
      if (startGameBtn) {
        const isHost = game.hostId === user.uid;

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
              toast("Game not found.");
              return;
            }
            const latest = latestSnap.data();
            if (latest.status !== "waiting") {
              toast("Game has already started.");
              return;
            }

            const playersSnap = await getDocs(
              collection(db, "games", gameId, "players")
            );
            const playerIds = playersSnap.docs.map((d) => d.id);

            if (playerIds.length < 3) {
              toast("At least 3 players are required to start.");
              return;
            }

            // Create circular assignments
            const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
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
            toast(`Start game failed: ${err.message || err.code || "Error"}`);
          }
        });
      }
    } catch (err) {
      console.error("Lobby error:", err);
      toast(`Lobby error: ${err.message || err.code || "Error"}`);
    }
  })();
}

// ===============================
// Lobby: Reveal button enable when started
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

  const gameRef = doc(db, "games", gameId);

  const first = await getDoc(gameRef);
  if (first.exists() && first.data().status === "started") {
    revealBtn.disabled = false;
    revealStatus.textContent =
      "Game started! Click to view your assignment.";
  } else {
    revealBtn.disabled = true;
    revealStatus.textContent =
      "Waiting for host to start the game...";
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
// Reveal Page
// ===============================
const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) {
        toast("Missing gameId in URL.");
        return;
      }

      const user = await requireUser();
      if (!user) return;

      const assignRef = doc(db, "assignments", `${gameId}_${user.uid}`);
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
      toast(`Reveal error: ${err.message || err.code || "Error"}`);
    }
  })();
}
