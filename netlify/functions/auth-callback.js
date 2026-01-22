// netlify/functions/auth-callback.js
export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");

    if (!code) {
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    // grab cookies (for pkce)
    const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .filter(Boolean)
        .map((c) => {
          const [k, ...rest] = c.trim().split("=");
          return [k, rest.join("=")];
        })
    );

    const verifier = cookies.pkce;
    if (!verifier) {
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    // exchange code for tokens
    const body = new URLSearchParams({
      client_id: process.env.HACKCLUB_CLIENT_ID,
      client_secret: process.env.HACKCLUB_CLIENT_SECRET,
      redirect_uri: process.env.HACKCLUB_REDIRECT_URI,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier
    });

    const tokenRes = await fetch("https://auth.hackclub.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", await tokenRes.text());
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    const tokenSet = await tokenRes.json();
    const idToken = tokenSet.id_token;

    if (!idToken) {
      console.error("No id_token in token response", tokenSet);
      return {
        statusCode: 302,
        headers: { Location: "/login.html" }
      };
    }

    return {
      statusCode: 302,
      headers: {
        // session cookie – 7 days, HttpOnly, cross-site friendly
        "Set-Cookie": [
          `session=${idToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=604800`,
          // clear pkce
          `pkce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
        ].join(", "),
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
