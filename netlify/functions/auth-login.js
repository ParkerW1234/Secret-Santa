import { Issuer, generators } from "openid-client";
import cookie from "cookie";

export async function handler() {
  const hackclub = await Issuer.discover("https://auth.hackclub.com");

  const client = new hackclub.Client({
    client_id: process.env.HACKCLUB_CLIENT_ID,
    client_secret: process.env.HACKCLUB_CLIENT_SECRET,
    redirect_uris: [process.env.HACKCLUB_REDIRECT_URI],
    response_types: ["code"]
  });

  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": cookie.serialize("pkce", codeVerifier, {
        httpOnly: true,
        secure: true,
        path: "/"
      }),
      Location: client.authorizationUrl({
        scope: process.env.HACKCLUB_SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: "S256"
      })
    }
  };
}
