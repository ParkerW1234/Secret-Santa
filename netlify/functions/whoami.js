// netlify/functions/whoami.js

exports.handler = async (event) => {
  try {
    const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
    if (!cookieHeader) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firebaseToken: null })
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

    const token = cookies.session || null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firebaseToken: token })
    };
  } catch (err) {
    console.error("whoami error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firebaseToken: null })
    };
  }
};
