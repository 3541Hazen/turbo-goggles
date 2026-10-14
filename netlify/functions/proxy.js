const UPSTREAM = "https://now.gg";
const ROBLOX_DEFAULT_PATH = "/apps/roblox-corporation/2349/roblox.html";

const BLOCKED_HOSTS = [
  "googlesyndication", "doubleclick", "googleadservices", "google-analytics",
  "googletagmanager", "googletagservices", "adservice.google", "adnxs",
  "advertising.com", "outbrain", "taboola", "criteo", "pubmatic",
  "openx", "amazon-adsystem", "popads", "popcash", "adcolony",
  "unityads", "ironsrc", "applovin", "vungle", "adroll", "quantserve",
  "scorecardresearch"
];

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*"
  };
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "now.gg" || host.endsWith(".now.gg");
}

function isBlocked(url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return (
    BLOCKED_HOSTS.some((item) => host.includes(item)) ||
    /\/(ads?|advertising|telemetry|analytics|metrics|vpn-detect|fraud)(\/|\$)/i.test(path) ||
    /prebid|adblock|amplitude|fingerprint|telemetry/i.test(path)
  );
}

exports.handler = async function (event, context) {
  const headers = getCorsHeaders();

  // Handle CORS preflight options request
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    let targetUrl;
    const rawPath = event.path;

    // Check if handling an explicit deeply nested proxy route
    if (rawPath.startsWith("/proxy/")) {
      const encoded = rawPath.slice("/proxy/".length);
      targetUrl = new URL(decodeURIComponent(encoded));

      if (targetUrl.protocol !== "https:") {
        return { statusCode: 400, headers, body: "Only HTTPS upstream URLs are allowed" };
      }
      if (!isAllowedHost(targetUrl.hostname)) {
        return { statusCode: 403, headers, body: "Forbidden upstream host" };
      }
    } else {
      // Default entry point mapping
      let assignedPath = rawPath;
      if (assignedPath === "/" || assignedPath === "/index.html") {
        assignedPath = ROBLOX_DEFAULT_PATH;
      }
      
      // Append original query string parameters
      const searchParams = new URLSearchParams(event.queryStringParameters).toString();
      const suffix = searchParams ? `?${searchParams}` : "";
      targetUrl = new URL(assignedPath + suffix, UPSTREAM);
    }

    // Silent drops for trackers and ad scripts
    if (isBlocked(targetUrl)) {
      return { statusCode: 204, headers, body: "" };
    }

    // Clone headers safely for downstream requests
    const outboundHeaders = { ...event.headers };
    outboundHeaders["host"] = targetUrl.host;
    outboundHeaders["referer"] = UPSTREAM + "/";
    
    // Scrub internal cloud provider headers
    delete outboundHeaders["x-forwarded-for"];
    delete outboundHeaders["x-nf-client-connection-ip"];

    const response = await fetch(targetUrl.href, {
      method: event.httpMethod,
      headers: outboundHeaders,
      body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : event.body,
      redirect: "manual"
    });

    // Capture standard response headers
    const responseHeaders = { ...getCorsHeaders() };
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Handle Upstream location redirects
    if (response.status >= 300 && response.status < 400 && responseHeaders["location"]) {
      try {
        const dest = new URL(responseHeaders["location"], targetUrl.href);
        if (isAllowedHost(dest.hostname)) {
          responseHeaders["location"] = `/proxy/${encodeURIComponent(dest.href)}`;
        }
      } catch (e) {
        // Fallback safely if URL mapping fails
      }
    }

    // Read payload asset data
    const contentType = response.headers.get("content-type") || "";
    let bodyData;
    let isBase64Encoded = false;

    if (contentType.includes("text") || contentType.includes("json") || contentType.includes("javascript")) {
      bodyData = await response.text();
    } else {
      const buffer = await response.arrayBuffer();
      bodyData = Buffer.from(buffer).toString("base64");
      isBase64Encoded = true;
    }

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: bodyData,
      isBase64Encoded
    };

  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: `Proxy failure processing request: ${err.message}`
    };
  }
};
