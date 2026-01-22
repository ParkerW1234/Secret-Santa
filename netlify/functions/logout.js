// netlify/functions/logout.js

exports.handler = async () => {
  const expiredCookie = [
    "session=",
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Path=/",
    "Max-Age=0"
  ].join("; ");

  return {
    statusCode: 302,
    headers: {
      "Set-Cookie": expiredCookie,
      Location: "/login.html"
    }
  };
};
