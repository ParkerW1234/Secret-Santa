import cookie from "cookie";
import jwt from "jsonwebtoken";

export async function handler(event) {
  const cookies = cookie.parse(event.headers.cookie || "");

  if (!cookies.session) {
    return { statusCode: 401, body: "Not signed in" };
  }

  const decoded = jwt.decode(cookies.session);
  return {
    statusCode: 200,
    body: JSON.stringify(decoded)
  };
}
