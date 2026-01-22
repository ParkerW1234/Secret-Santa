import { Issuer } from "openid-client";
import cookie from "cookie";

export async function handler(event) {
  const hackclub = await Issuer.discover("https://auth.hackclub.com");

  const client = new hackclub.Client({
    client_id: process.env.HACKCLUB_CLIENT_ID,
    client_secret: process.env.HACKCLUB_CLIENT_SECRET,
    redirect_uris: [process.env.HACKCLUB_REDIRECT_URI],
    response_types: ["code"],
  });

  const cookies = cookie.parse(event.headers.cookie || "");
  const params = client.callbackParams(event);

  const tokenSet = await client.callback(
    process.env.HACKCLUB_REDIRECT_URI,
    params,
    { code_verifier: cookies.verifier }
  );

  const idToken = tokenSet.id_token;

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": `session=${idToken}; HttpOnly; Path=/; Secure`,
      Location: "/dashboard.html"
    }
  };
}
