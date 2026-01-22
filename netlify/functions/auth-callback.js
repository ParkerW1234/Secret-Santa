// netlify/functions/auth-callback.js

const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // 🔥 FIX #1: Reconstitute PEM formatting for Firebase Admin
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

  console.log("PRIVATE_KEY_RAW:", JSON.stringify(serviceAccount.private_key));


  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");

    if (!code) {
      console.error("No code in callback URL");
      return redirect("/login.html");
    }

    // Exchange code for tokens at Hack Club Auth
    const body = new URLSearchParams({
      client_id: process.env.HACKCLUB_CLIENT_ID,
      client_secret: process.env.HACKCLUB_CLIENT_SECRET,
      redirect_uri: process.env.HACKCLUB_REDIRECT_URI,
      grant_type: "authorization_code",
      code
    });

    const tokenRes = await fetch("https://auth.hackclub.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return redirect("/login.html");
    }

    const tokenSet = await tokenRes.json();
    const idToken = tokenSet.id_token;

    if (!idToken) {
      console.error("No id_token in response:", tokenSet);
      return redirect("/login.html");
    }

    // Decode JWT payload manually (no validation required yet)
    const payload = decodeJWT(idToken);
    if (!payload) return redirect("/login.html");

    const sub = payload.sub;   // Hack Club's stable user ID
    const email = payload.email || null;
    const name = payload.name || email || sub;

    // 🔥 FIX #2: Mint Firebase token with UID = sub
    const firebaseToken = await admin.auth().createCustomToken(sub, { email, name });

    // 🔥 FIX #3: Set HttpOnly cookie for session
    const cookie = [
      `session=${firebaseToken}`,
      `HttpOnly`,
      `Secure`,
      `SameSite=None`,
      `Path=/`,
      `Max-Age=604800` // 7 days
    ].join("; ");

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/dashboard.html"
      }
    };

  } catch (err) {
    console.error("auth-callback error:", err);
    return redirect("/login.html");
  }
};

// --- helper utilities ---

function redirect(loc) {
  return {
    statusCode: 302,
    headers: { Location: loc }
  };
}

// 🔍 Manual JWT decode
function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const padded = parts[1].padEnd(
      parts[1].length + (4 - (parts[1].length % 4)) % 4,
      "="
    );

    const json = Buffer.from(
      padded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");

    return JSON.parse(json);
  } catch (e) {
    console.error("decodeJWT failed:", e);
    return null;
  }
}
