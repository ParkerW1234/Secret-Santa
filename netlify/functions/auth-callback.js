// netlify/functions/auth-callback.js

export async function handler(event) {
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

    // Set HttpOnly session cookie for 7 days
    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": `session=${idToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800`,
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
}
