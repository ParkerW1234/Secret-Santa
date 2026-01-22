// netlify/functions/auth-login.js

exports.handler = async () => {
  const params = new URLSearchParams({
    client_id: process.env.HACKCLUB_CLIENT_ID,
    redirect_uri: process.env.HACKCLUB_REDIRECT_URI,
    response_type: "code",
    scope: "openid profile email verification_status"
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://auth.hackclub.com/oauth/authorize?${params.toString()}`
    }
  };
};
