// netlify/functions/auth-login.js
import crypto from "node:crypto";

export async function handler() {
  // Generate PKCE verifier
  const verifier = crypto.randomBytes(32).toString("base64url");

  // Compute PKCE challenge
  const hash = crypto.createHash("sha256").update(verifier).digest("base64");
  const challenge = hash
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const params = new URLSearchParams({
    client_id: process.env.HACKCLUB_CLIENT_ID,
    redirect_uri: process.env.HACKCLUB_REDIRECT_URI,
    response_type: "code",
    scope: process.env.HACKCLUB_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });

  return {
    statusCode: 302,
    headers: {
      // short-lived pkce cookie
      "Set-Cookie": [
        `pkce=${verifier}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
      ].join(", "),
      Location: `https://auth.hackclub.com/oauth/authorize?${params.toString()}`
    }
  };
}
