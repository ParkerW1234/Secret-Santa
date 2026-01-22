import { Issuer, generators } from "openid-client";

export async function handler(event, context) {
  const hackclub = await Issuer.discover("https://auth.hackclub.com");

  const client = new hackclub.Client({
    client_id: process.env.HACKCLUB_CLIENT_ID,
    client_secret: process.env.HACKCLUB_CLIENT_SECRET,
    redirect_uris: [process.env.HACKCLUB_REDIRECT_URI],
    response_types: ["code"]
  });

  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  // Store verifier using Netlify cookies
  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": `verifier=${codeVerifier}; HttpOnly; Path=/; Secure`,
      Location: client.authorizationUrl({
        scope: process.env.HACKCLUB_SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      })
    }
  };
}
