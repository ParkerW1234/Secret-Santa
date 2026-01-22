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
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("app.js loaded on:", window.location.href);

const db = getFirestore();

/* ============================================================
   AUTH HANDLERS (Netlify + Hack Club Auth)
   ============================================================ */

async function fetchUser() {
  const res = await fetch("/.netlify/functions/whoami");
  const data = await res.json();
  return data.user; // { email, sub, name } or null
}

async function requireUser() {
  const user = await fetchUser();
  if (!user) {
    window.location.href = "login.html";
    return null;
  }
  return user;
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ============================================================
   ROUTE PROTECTION + REDIRECT LOGIC
   ============================================================ */

(async () => {
  const path = window.location.pathname;
  const user = await fetchUser();

  if (!user) {
    if (path.includes("dashboard") || path.includes("lobby") || path.includes("reveal")) {
      window.location.href = "login.html";
    }
  } else {
    if (path.includes("login")) {
      window.location.href = "dashboard.html";
    }
  }
})();

/* ============================================================
   LOGIN + LOGOUT BUTTONS
   ============================================================ */

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

/* ============================================================
   USERNAME PROFILE HANDLING
   ============================================================ */

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

/* ============================================================
   CREATE GAME
   ============================================================ */

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

/* ============================================================
   JOIN GAME
   ============================================================ */

const joinGameBtn = document.getElementById("joinGameBtn");
if (joinGameBtn) {
  joinGameBtn.addEventListener("click", async () => {
    try {
      const user = await requireUser();
      if (!user) return toast("You must be logged in.");

      const codeEl = document.getElementById("gameCode");
      const code = codeEl?.value?.trim()?.toUpperCase();
      if (!code) return toast("Enter a game code.");

      const q = query(collection(db, "games"), where("code", "==", code));
      const snap = await getDocs(q);

      if (snap.empty) return toast("Game not found.");

      const gameDoc = snap.docs[0];
      const game = gameDoc.data();

      if (game.status !== "waiting") {
        return toast("Game has already started.");
      }

      window.location.href = `lobby.html?id=${gameDoc.id}`;
    } catch (err) {
      console.error("Join game failed:", err);
      toast(`Join game failed: ${err.message}`);
    }
  });
}

/* ============================================================
   LOBBY PAGE (Players List + Host Controls)
   ============================================================ */

const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");

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

      const userProfileSnap = await getDoc(doc(db, "users", user.email));
      const username = userProfileSnap.exists() ? (userProfileSnap.data().username || "") : "";

      const playerRef = doc(db, "games", gameId, "players", user.email);
      await setDoc(playerRef, {
        joinedAt: serverTimestamp(),
        email: user.email,
        username
      }, { merge: true });

      const playersCol = collection(db, "games", gameId, "players");
      onSnapshot(playersCol, (snap) => {
        playerListEl.innerHTML = "";
        snap.forEach((d) => {
          const li = document.createElement("li");
          li.textContent = d.data().username || d.data().email || d.id;
          playerListEl.appendChild(li);
        });
      });
    } catch (err) {
      console.error("Lobby error:", err);
      toast(`Lobby error: ${err.message}`);
    }
  })();
}

/* ============================================================
   START GAME + ASSIGNMENTS
   ============================================================ */

const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");

if (startGameBtn && playerListEl) {
  (async () => {
    const gameId = getGameIdFromUrl();
    if (!gameId) return;

    const user = await requireUser();
    if (!user) return;

    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return;

    const game = gameSnap.data();
    const isHost = game.hostId === user.email;

    if (!isHost) {
      startGameBtn.disabled = true;
      if (hostOnlyNote) hostOnlyNote.textContent = "Only the host can start the game.";
    } else {
      if (hostOnlyNote) hostOnlyNote.textContent = "You are the host.";
    }

    startGameBtn.addEventListener("click", async () => {
      try {
        const latestGameSnap = await getDoc(gameRef);
        const latest = latestGameSnap.data();
        if (latest.status !== "waiting") {
          return toast("Game already started.");
        }

        const playersSnap = await getDocs(collection(db, "games", gameId, "players"));
        const playerIds = playersSnap.docs.map((d) => d.id);

        if (playerIds.length < 3) return toast("Requires at least 3 players.");

        const pairs = makeAssignments(playerIds);
        const batch = writeBatch(db);

        for (const p of pairs) {
          const assignRef = doc(db, "assignments", `${gameId}_${p.giverId}`);
          batch.set(assignRef, {
            gameId,
            giverId: p.giverId,
            receiverId: p.receiverId,
            createdAt: serverTimestamp()
          });
        }

        batch.update(gameRef, {
          status: "started",
          startedAt: serverTimestamp()
        });

        await batch.commit();
        toast("Game started! Go to reveal page.");
      } catch (err) {
        console.error("Start game failed:", err);
        toast(`Start failed: ${err.message}`);
      }
    });
  })();
}

function makeAssignments(playerIds) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  return shuffled.map((giverId, i) => ({
    giverId,
    receiverId: shuffled[(i + 1) % shuffled.length]
  }));
}

/* ============================================================
   REVEAL PAGE
   ============================================================ */

const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing gameId.");

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
      const recName = recSnap.exists() && recSnap.data().username
        ? recSnap.data().username
        : "Your assigned person";

      revealText.textContent = `You are buying for: ${recName}`;
    } catch (err) {
      console.error("Reveal error:", err);
      toast(`Reveal error: ${err.message}`);
    }
  })();
}

/* ============================================================
   LOBBY REVEAL BUTTON AUTO-ENABLE
   ============================================================ */

(async () => {
  if (!window.location.pathname.includes("lobby")) return;

  const revealBtn = document.getElementById("revealBtn");
  const revealStatus = document.getElementById("revealStatus");
  if (!revealBtn || !revealStatus) return;

  const gameId = getGameIdFromUrl();
  if (!gameId) return;

  revealBtn.disabled = true;
  revealStatus.textContent = "Waiting for host...";

  const gameRef = doc(db, "games", gameId);

  const first = await getDoc(gameRef);
  if (first.exists()) {
    const g = first.data();
    if (g.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! Click to reveal.";
    }
  }

  onSnapshot(gameRef, (snap) => {
    if (!snap.exists()) return;
    const game = snap.data();
    if (game.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! Click to reveal.";
    } else {
      revealBtn.disabled = true;
      revealStatus.textContent = "Waiting for host...";
    }
  });

  revealBtn.addEventListener("click", () => {
    window.location.href = `reveal.html?id=${gameId}`;
  });
})();

/* ============================================================
   HELPERS
   ============================================================ */

function getGameIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("gameId") || "";
}
