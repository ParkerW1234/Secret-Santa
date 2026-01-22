// netlify/functions/auth-callback.js

const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
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
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
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
      const text = await tokenRes.text();
      console.error("Token exchange failed:", text);
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    const tokenSet = await tokenRes.json();
    const idToken = tokenSet.id_token;

    if (!idToken) {
      console.error("No id_token in token response:", tokenSet);
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    // Decode Hack Club id_token payload
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      console.error("Invalid id_token format");
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    const payloadB64 = parts[1];
    const padded = payloadB64.padEnd(payloadB64.length + (4 - (payloadB64.length % 4)) % 4, "=");
    const payloadJson = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    const payload = JSON.parse(payloadJson);

    const sub = payload.sub;           // Hack Club ID (your uid)
    const email = payload.email || null;
    const name = payload.name || email || sub;

    // Mint Firebase custom token with uid = sub
    const firebaseToken = await admin.auth().createCustomToken(sub, {
      email,
      name
    });

    // Store Firebase custom token in HttpOnly cookie
    const cookie = [
      `session=${firebaseToken}`,
      "HttpOnly",
      "Secure",
      "SameSite=None",
      "Path=/",
      "Max-Age=604800" // 7 days
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
    return {
      statusCode: 302,
      headers: { Location: "/login.html" }
    };
  }
};
