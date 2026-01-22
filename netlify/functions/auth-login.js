export async function handler() {
  const verifier = crypto.randomUUID().replace(/-/g, '');
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

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
