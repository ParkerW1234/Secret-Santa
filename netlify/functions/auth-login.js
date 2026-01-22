import crypto from "node:crypto";

export async function handler() {
  // generate PKCE code verifier
  const verifier = crypto.randomUUID().replace(/-/g, "");

  // generate PKCE code challenge
  const hash = crypto.createHash("sha256").update(verifier).digest();
  const challenge = hash.toString("base64")
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
      "Set-Cookie": `pkce=${verifier}; HttpOnly; Secure; Path=/`,
      Location: `https://auth.hackclub.com/oauth/authorize?${params.toString()}`
    }
  };
}
