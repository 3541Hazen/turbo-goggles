const UPSTREAM = "https://now.gg";
const ROBLOX_DEFAULT_PATH = "/apps/roblox-corporation/2349/roblox.html";

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*"
  };
}

exports.handler = async function (event, context) {
  const headers = getCorsHeaders();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // Parse path and append incoming queries safely
  let assignedPath = event.path;
  if (assignedPath === "/" || assignedPath === "/index.html" || assignedPath.startsWith("/proxy")) {
    assignedPath = ROBLOX_DEFAULT_PATH;
  }
  
  const searchParams = new URLSearchParams(event.queryStringParameters).toString();
  const suffix = searchParams ? `?${searchParams}` : "";
  const directTargetUrl = `${UPSTREAM}${assignedPath}${suffix}`;

  // Deliver an unrestrictive viewport container shell to allow WebRTC handshakes to succeed
  const orchestratorHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Cloud Gaming Portal</title>
      <style type="text/css">
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background-color: #000;
        }
        iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
        }
      </style>
    </head>
    <body>
      <iframe 
        id="game-canvas-frame" 
        src="${directTargetUrl}" 
        allow="autoplay; gamepad; fullscreen; keyboard; screen-wake-lock;">
      </iframe>
    </body>
    </html>
  `;

  return {
    statusCode: 200,
    headers: {
      ...headers,
      "Content-Type": "text/html"
    },
    body: orchestratorHtml
  };
};
