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

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    let targetUrl;
    const rawPath = event.path;
    const hostUrl = `https://${event.headers.host}`;

    // 1. Resolve target asset URL execution routing
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
      let assignedPath = rawPath;
      if (assignedPath === "/" || assignedPath === "/index.html") {
        assignedPath = ROBLOX_DEFAULT_PATH;
      }
      
      const searchParams = new URLSearchParams(event.queryStringParameters).toString();
      const suffix = searchParams ? `?${searchParams}` : "";
      targetUrl = new URL(assignedPath + suffix, UPSTREAM);
    }

    if (isBlocked(targetUrl)) {
      return { statusCode: 204, headers, body: "" };
    }

    // 2. Map standard operational headers safely
    const outboundHeaders = {};
    const forwardableHeaders = [
      "accept", "accept-language", "cache-control", "content-type", 
      "user-agent", "cookie", "authorization"
    ];
    
    for (const key of forwardableHeaders) {
      if (event.headers[key]) {
        outboundHeaders[key] = event.headers[key];
      }
    }
    
    outboundHeaders["host"] = targetUrl.host;
    outboundHeaders["referer"] = UPSTREAM + "/";

    const response = await fetch(targetUrl.href, {
      method: event.httpMethod,
      headers: outboundHeaders,
      body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : event.body,
      redirect: "manual"
    });

    const responseHeaders = { ...getCorsHeaders() };
    response.headers.forEach((value, key) => {
      if (!["content-security-policy", "x-frame-options", "content-encoding"].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      try {
        const dest = new URL(response.headers.get("location"), targetUrl.href);
        responseHeaders["location"] = `/proxy/${encodeURIComponent(dest.href)}`;
        return { statusCode: response.status, headers: responseHeaders, body: "" };
      } catch (e) {}
    }

    const contentType = response.headers.get("content-type") || "";
    
    // 3. Process Text, HTML and Asynchronous Webpack JavaScript Engine Chunks
    if (contentType.includes("text/html") || contentType.includes("application/javascript") || contentType.includes("text/javascript")) {
      let text = await response.text();
      
      // Server-side path rewriter: forces background script endpoints to map back to your proxy gateway domain
      text = text.replace(/https:\/\/now\.gg/g, hostUrl);
      text = text.replace(/https:\/\/([a-z0-9]+)\.now\.gg/g, (match, sub) => {
        return `${hostUrl}/proxy/${encodeURIComponent(`https://\${sub}.now.gg`)}`;
      });

      // Handle raw root paths for background image elements
      if (contentType.includes("text/html")) {
        text = text.replace(/(src|href|action)="\/(?!\/)/g, `$1="${hostUrl}/`);
        text = text.replace(/(src|href|action)='\/(?!\/)/g, `$1='${hostUrl}/`);

        const antiBlockBypassScript = `
          <style type="text/css">
            [class*="adblock"], [id*="adblock"], 
            [class*="modal-root"], [class*="ModalContainer"],
            div[style*="backdrop-filter"], div[style*="rgba(0, 0, 0"],
            #interstitial-ad-container, .sc-unblock, div[class*="paywall"],
            div[class*="AdBlockModal"], div[id*="ad-overlay"] {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          </style>
          <script type="text/javascript">
            (function() {
              window.google_ad_client = "ca-pub-dummy";
              window.adsbygoogle = { push: function() {}, loaded: true, cmd: [] };
              try {
                Object.defineProperty(window, 'adBlockerDetected', { value: false, writable: false });
                Object.defineProperty(window, 'google_ad_status', { value: 1, writable: false });
              } catch(e) {}

              const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                  for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                      const content = node.innerText || "";
                      if (content.includes("allow ads") || content.includes("ad blocker") || node.className.includes("modal")) {
                        node.remove();
                      }
                    }
                  }
                }
              });
              observer.observe(document.documentElement, { childList: true, subtree: true });
            })();
          </script>
        `;
        text = text.replace("<head>", `<head>${antiBlockBypassScript}`);
      }
      
      return {
        statusCode: response.status,
        headers: { ...responseHeaders, "content-type": contentType },
        body: text,
        isBase64Encoded: false
      };
    }

    // Binary Assets (Images, Audio assets, WebAssembly code blocks)
    const buffer = await response.arrayBuffer();
    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: Buffer.from(buffer).toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: `Proxy asset streaming exception: ${err.message}`
    };
  }
};
