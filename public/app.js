import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
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
  updateDoc,
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
function waitForUser() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

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
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast("Copied!");
  }
}

onAuthStateChanged(auth, (user) => {
  const path = window.location.pathname;

  if (!user) {
    console.log("Logged out");

    // If user is logged out and tries to access protected pages
    if (
      path.includes("dashboard") ||
      path.includes("lobby") ||
      path.includes("reveal")
    ) {
      window.location.href = "login.html";
    }
  } else {
    console.log("Logged in:", user.email);

    // If logged in and on login page, send to dashboard
    if (path.includes("login")) {
      window.location.href = "dashboard.html";
    }
  }
});


function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
const usernameInput = document.getElementById("usernameInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const currentUsernameEl = document.getElementById("currentUsername");

if (usernameInput && saveUsernameBtn && currentUsernameEl) {
  (async () => {
    const user = await waitForUser();
    if (!user) return;

    // load existing username
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data().username) {
      currentUsernameEl.textContent = `Current username: ${snap.data().username}`;
      usernameInput.value = snap.data().username;
    } else {
      currentUsernameEl.textContent = "No username set yet.";
    }

    // save username
    saveUsernameBtn.addEventListener("click", async () => {
      const username = usernameInput.value.trim();
      if (!username) return toast("Enter a username.");

      await setDoc(userRef, { username }, { merge: true });
      currentUsernameEl.textContent = `Current username: ${username}`;
      toast("Username saved!");
    });
  })();
}

const joinGameBtn = document.getElementById("joinGameBtn");
if (joinGameBtn) {
  console.log("Found joinGameBtn, wiring click handler...");

joinGameBtn.addEventListener("click", async () => {
  try{
    const user = await waitForUser();
    if (!user) return toast("You must be logged in.");

    const codeEl = document.getElementById("gameCode");
    const code = codeEl?.value?.trim()?.toUpperCase();
    if (!code) return toast("Enter a game code.");
    
    const q = query(collection(db, "games"), where("code", "==", code));
    const snap = await getDocs(q);

    if (snap.empty) return toast("Game not found. Check the code.");

    const gameDoc = snap.docs[0];
    const game = gameDoc.data();

    if (game.status !== "waiting") {
      return toast("That game has already started. You may no longer join.");
    }

    window.location.href = `lobby.html?id=${gameDoc.id}`;
  } catch (err) {
    console.error("Join game failed:", err);
    toast(`Join game failed: ${err.code || err.message}`);
    }
  });
}


const gameCodeText = document.getElementById("gameCodeText");
const playerListEl = document.getElementById("playerList");

if (gameCodeText && playerListEl) {
(async() => {
  try {
    const gameId = getGameIdFromUrl();
if (!gameId) return toast("Missing game id in URL.");

const user = await waitForUser();
if (!user) return toast("Not logged in.");

    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return toast("Game not found.");

    const game = gameSnap.data();
    gameCodeText.textContent = game.code;
    const userProfileSnap = await getDoc(doc(db, "users", user.uid));
    const username = userProfileSnap.exists() ? (userProfileSnap.data().username || "") : "";

    const playerRef = doc(db, "games", gameId, "players", user.uid);
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
    toast(`Lobby error: ${err.code || err.message}`);
  }
})();
}

const startGameBtn = document.getElementById("startGameBtn");
const hostOnlyNote = document.getElementById("hostOnlyNote");
if (startGameBtn && playerListEl) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return;

      const user = await waitForUser();
      if (!user) return;

      const gameRef = doc(db, "games", gameId);
      const gameSnap = await getDoc(gameRef);
      if (!gameSnap.exists()) return;

      const game = gameSnap.data();

      const isHost = game.hostId === user.uid;
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
            return toast("Game has already started.");
          }
          
          const playersSnap = await getDocs(collection(db, "games", gameId, "players"));
          const playerIds = playersSnap.docs.map((d) => d.id);

          if (playerIds.length < 3) {
            return toast("At least 3 players are required to start the game.");
          }

          const pairs = makeAssigments(playerIds);

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

          toast("Game started! Go to the reveal page to see your assignment.");
        } catch (err) {
          console.error("Start game failed:", err);
          toast(`Start game failed: ${err.code || err.message}`);
        }
      });
    } catch (err) {
      console.error("Setup start game failed:", err);
    }
  })();
}
          
        

function makeAssigments(playerIds) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

  return shuffled.map((giverId, i) => ({
    giverId,
    receiverId: shuffled[(i + 1) % shuffled.length],
  }));
}

const revealText = document.getElementById("revealText");
if (revealText) {
  (async () => {
    try {
      const gameId = getGameIdFromUrl();
      if (!gameId) return toast("Missing gameId in URL.");

      const user = await waitForUser();
      if (!user) return toast("Not logged in.");

      const assignRef = doc(db, "assignments", `${gameId}_${user.uid}`);
      const assignSnap = await getDoc(assignRef);
     
      if (!assignSnap.exists()) {
        revealText.textContent = "Assignment not found. Are you sure the game has started?";
        return;
      }

      const { receiverId } = assignSnap.data();

      const reciversnap = await getDoc(doc(db, "users", receiverId));
        const reciverName =
          reciversnap.exists() && reciversnap.data().username
          ? reciversnap.data().username
          : "Your assigned person";

      revealText.textContent = `You are buying for: ${reciverName}`;
    } catch (err) {
      console.error("Reveal error:", err);
      toast(`Reveal error: ${err.code || err.message}`);
    }
  })();
}

function getGameIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || params.get("gameId") || "";
}

const copyBtn = document.getElementById("copyCodeBtn");
if (copyBtn) {
  copyBtn.onclick = () => copyToClipboard(game.code);
}

(async () => {
  // Only run this on the lobby page
  if (!window.location.pathname.includes("lobby")) return;

  const revealBtn = document.getElementById("revealBtn");
  const revealStatus = document.getElementById("revealStatus");
  if (!revealBtn || !revealStatus) return;

  console.log("[revealBtn] wired on lobby");

  const gameId = getGameIdFromUrl();
  console.log("[revealBtn] gameId =", gameId);

  if (!gameId) {
    revealBtn.disabled = true;
    revealStatus.textContent = "Missing game id.";
    return;
  }

  // Click handler (always wired)
  revealBtn.addEventListener("click", () => {
    console.log("[revealBtn] CLICK fired. disabled =", revealBtn.disabled);
    window.location.href = `reveal.html?id=${gameId}`;
  });

  // Start disabled until started
  revealBtn.disabled = true;
  revealStatus.textContent = "Waiting for host to start the game...";

  const gameRef = doc(db, "games", gameId);

  // One-time read
  const first = await getDoc(gameRef);
  if (first.exists()) {
    const g = first.data();
    console.log("[revealBtn] initial status =", g.status);
    if (g.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! Click to view your assignment.";
    }
  }

  // Live updates
  onSnapshot(gameRef, (snap) => {
    if (!snap.exists()) return;
    const game = snap.data();
    console.log("[revealBtn] snapshot status =", game.status);

    if (game.status === "started") {
      revealBtn.disabled = false;
      revealStatus.textContent = "Game started! Click to view your assignment.";
    } else {
      revealBtn.disabled = true;
      revealStatus.textContent = "Waiting for host to start the game...";
    }
  });
})();




function makeGameCode(len = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789"
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const createGameBtn = document.getElementById("createGameBtn");
if (createGameBtn) {
  console.log("Found createGameBtn, wiring click handler");

  createGameBtn.addEventListener("click", async () => {
    try{
      const user = await waitForUser();
      if (!user) return toast("You must be logged in.");

      const code = makeGameCode(5);
      
      const gameRef = await addDoc(collection(db, "games"), {
        code,
        hostId: user.uid,
        status: "waiting",
        createdAt: serverTimestamp()  
});

window.location.href = `lobby.html?id=${gameRef.id}`;
    } catch (err) { 
      console.error("Create game failed:", err);
      toast(`Create game failed: ${err.code || err.message}`);
    }
  });
}
// Finish sign-in if user clicked the email link
(async function finishEmailLinkSignIn() {
  try {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const storedEmail = localStorage.getItem("emailForSignIn");
    const email = storedEmail || window.prompt("Confirm your email to finish sign-in:");

    if (!email) return;

    await signInWithEmailLink(auth, email, window.location.href);
    localStorage.removeItem("emailForSignIn");

    // remove the long oobCode URL params
    window.history.replaceState({}, document.title, window.location.pathname);

    // go to dashboard
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Finish sign-in failed:", err);
    toast(`Finish sign-in failed: ${err.code || err.message}`);
  }
})();
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  console.log("Found logoutBtn, wiring click handler...");
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    toast("Logged out");
    window.location.href = "login.html";
  });
}


// Wire login button if present
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  console.log("Found loginBtn, wiring click handler...");

  loginBtn.addEventListener("click", async () => {
    try {
      const emailEl = document.getElementById("email");
      const email = emailEl?.value?.trim();

      if (!email) return toast("Enter your email.");

      const actionCodeSettings = {
        url: `${window.location.origin}/public/login.html`,
        handleCodeInApp: true,
      };

      console.log("Sending sign-in link to:", email);
      console.log("Continue URL:", actionCodeSettings.url);

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);

      localStorage.setItem("emailForSignIn", email);
      toast("Login link sent! Check your inbox (and spam).");
    } catch (err) {
      console.error("Send link failed:", err);
      toast(`Send link failed: ${err.code || err.message}`);
    }
  });
} else {
  console.log("loginBtn not found on this page (that's fine on other pages).");
}
