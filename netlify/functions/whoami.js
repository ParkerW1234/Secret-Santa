// netlify/functions/whoami.js

function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  const payload = parts[1];

  // base64url → base64
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = b64 + (pad ? "=".repeat(4 - pad) : "");

  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json);
}

export async function handler(event) {
  try {
    const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
    if (!cookieHeader) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: null })
      };
    }

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .filter(Boolean)
        .map((c) => {
          const [k, ...rest] = c.trim().split("=");
          return [k, rest.join("=")];
        })
    );

    const token = cookies.session;
    if (!token) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: null })
      };
    }

    const payload = decodeJwt(token);

    const user = {
      email: payload.email || null,
      sub: payload.sub,
      name: payload.name || payload.email || payload.sub
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user })
    };
  } catch (err) {
    console.error("whoami error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: null })
    };
  }
}
