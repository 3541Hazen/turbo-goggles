// netlify/functions/proxy.js

const UPSTREAM = "https://now.gg";
const ROBLOX_DEFAULT_PATH =
  "/apps/roblox-corporation/2349/roblox.html";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(data, null, 2),
  };
}

function getRequestPath(event) {
  // Netlify may expose the original path in rawUrl,
  // path, or requestContext depending on the runtime.
  const rawUrl = event.rawUrl;

  if (rawUrl) {
    try {
      return new URL(rawUrl).pathname;
    } catch {
      // Fall through to the event path.
    }
  }

  return event.path || "/";
}

function getTargetUrl(event) {
  const path = getRequestPath(event);

  if (path === "/" || path === "/index.html") {
    return new URL(ROBLOX_DEFAULT_PATH, UPSTREAM);
  }

  // Do not accept arbitrary upstream URLs from the caller.
  // Only relative paths on the configured upstream are allowed.
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid request path");
  }

  const target = new URL(path, UPSTREAM);

  if (
    target.protocol !== "https:" ||
    (target.hostname !== "now.gg" &&
      !target.hostname.endsWith(".now.gg"))
  ) {
    throw new Error("Invalid upstream host");
  }

  const query = event.queryStringParameters || {};

  for (const [key, value] of Object.entries(query)) {
    if (key !== "debug" && value != null) {
      target.searchParams.set(key, value);
    }
  }

  return target;
}

exports.handler = async function (event) {
  const method = (event.httpMethod || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (!["GET", "HEAD"].includes(method)) {
    return jsonResponse(405, {
      error: "Method not allowed",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
    });
  }

  // Diagnostic endpoint:
  // /.netlify/functions/proxy?debug=1
  if (event.queryStringParameters?.debug === "1") {
    try {
      const response = await fetch(UPSTREAM, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });

      return jsonResponse(200, {
        functionRunning: true,
        upstreamStatus: response.status,
        upstreamContentType:
          response.headers.get("content-type"),
        upstreamRedirect:
          response.headers.get("location"),
        note:
          "This checks basic connectivity only, not game compatibility.",
      });
    } catch (error) {
      return jsonResponse(502, {
        functionRunning: true,
        upstreamError: error.message,
      });
    }
  }

  let target;

  try {
    target = getTargetUrl(event);
  } catch (error) {
    return jsonResponse(400, {
      error: error.message,
    });
  }

  try {
    const upstreamResponse = await fetch(target.href, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept:
          event.headers?.accept || "*/*",
        "Accept-Language":
          event.headers?.["accept-language"] || "en-US,en;q=0.9",
        "User-Agent":
          event.headers?.["user-agent"] || "Mozilla/5.0",
      },
    });

    // Do not silently follow redirects to another host.
    // Report them so the actual redirect can be diagnosed.
    const location =
      upstreamResponse.headers.get("location");

    if (
      upstreamResponse.status >= 300 &&
      upstreamResponse.status < 400 &&
      location
    ) {
      return {
        statusCode: upstreamResponse.status,
        headers: {
          ...CORS_HEADERS,
          Location: location,
        },
        body: "",
      };
    }

    const contentType =
      upstreamResponse.headers.get("content-type") ||
      "application/octet-stream";

    const responseHeaders = {
      ...CORS_HEADERS,
      "Content-Type": contentType,
    };

    // Preserve useful diagnostic information.
    if (upstreamResponse.status >= 400) {
      return jsonResponse(
        upstreamResponse.status,
        {
          error: "Upstream request failed",
          upstreamStatus: upstreamResponse.status,
          upstreamUrl: target.href,
          contentType,
        }
      );
    }

    if (method === "HEAD") {
      return {
        statusCode: upstreamResponse.status,
        headers: responseHeaders,
        body: "",
      };
    }

    const bytes = Buffer.from(
      await upstreamResponse.arrayBuffer()
    );

    return {
      statusCode: upstreamResponse.status,
      headers: responseHeaders,
      body: bytes.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return jsonResponse(502, {
      error: "Upstream request failed",
      message: error.message,
      target: target.href,
    });
  }
};


Note: This diagnostic version deliberately does not rewrite upstream HTML or assets. It helps isolate whether the upstream is reachable, but it is not a complete reverse proxy for a cloud gaming session. For actual gameplay, use the provider-supported embedding method and authorization.
