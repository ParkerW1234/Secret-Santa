export async function handler() {
  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": `session=; HttpOnly; Secure; Path=/; Max-Age=0`,
      Location: "/login.html"
    }
  };
}
