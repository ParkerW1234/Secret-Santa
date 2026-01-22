export async function handler(event) {
  const search = new URLSearchParams(event.rawQuery);
  const code = search.get("code");
  const cookies = Object.fromEntries(
    (event.headers.cookie || "").split("; ").map(v => v.split("="))
  );
  const verifier = cookies.pkce;

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

  const tokenSet = await tokenRes.json();

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": `session=${tokenSet.id_token}; HttpOnly; Secure; Path=/`,
      Location: "/dashboard.html"
    }
  };
}
