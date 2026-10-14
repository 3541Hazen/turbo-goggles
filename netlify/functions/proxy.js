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

  // Construct absolute entry target pointing directly into safe streaming targets
  let assignedPath = event.path;
  if (assignedPath === "/" || assignedPath === "/index.html" || assignedPath.startsWith("/proxy")) {
    assignedPath = ROBLOX_DEFAULT_PATH;
  }
  
  const searchParams = new URLSearchParams(event.queryStringParameters).toString();
  const suffix = searchParams ? `?${searchParams}` : "";
  const directTargetUrl = `${UPSTREAM}${assignedPath}${suffix}`;

  // Serve a clean orchestrator shell.
  // This layout builds a high-performance window that passes WebRTC/WebSocket layers untouched 
  // while applying immediate client-side mutation observers to wipe out blocker screens.
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
        allow="autoplay; gamepad; fullscreen; keyboard; screen-wake-lock;"
        sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts">
      </iframe>

      <script type="text/javascript">
        (function() {
          const frame = document.getElementById('game-canvas-frame');

          function injectionRoutine() {
            try {
              const frameWindow = frame.contentWindow;
              const frameDocument = frame.contentDocument || frame.contentWindow.document;

              if (!frameWindow || !frameDocument) return;

              // 1. Inject global stubs directly into the target window to fool blocker checks
              frameWindow.google_ad_client = "ca-pub-dummy";
              frameWindow.adsbygoogle = { push: function() {}, loaded: true, values: [] };
              frameWindow.adBlockerDetected = false;
              
              if (!frameWindow.google_ad_status) {
                Object.defineProperty(frameWindow, 'google_ad_status', { value: 1, writable: false });
              }

              // 2. Inject structural styling inside the iframe to keep everything clear
              let overrideStyle = frameDocument.getElementById('proxy-nuclear-override');
              if (!overrideStyle) {
                overrideStyle = frameDocument.createElement('style');
                overrideStyle.id = 'proxy-nuclear-override';
                overrideStyle.type = 'text/css';
                overrideStyle.innerText = \`
                  [class*="adblock"], [id*="adblock"], 
                  [class*="modal-root"], [class*="ModalContainer"],
                  div[style*="backdrop-filter"], div[style*="rgba(0, 0, 0"],
                  #interstitial-ad-container, .sc-unblock, div[class*="paywall"],
                  div[class*="AdBlockModal"], div[class*="AdAllowed"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    transform: scale(0) !important;
                  }
                  html, body {
                    overflow: auto !important;
                    position: static !important;
                  }
                \`;
                frameDocument.head.appendChild(overrideStyle);
              }

              // 3. Continuously clean runtime elements before they render visually
              const cleanEngine = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                  for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                      const text = node.innerText || "";
                      if (
                        text.includes("allow ads") || 
                        text.includes("ad blocker") || 
                        text.includes("turn off your ad") ||
                        node.className.includes("modal") ||
                        node.id.includes("ad")
                      ) {
                        node.remove();
                      }
                    }
                  }
                }
              });

              cleanEngine.observe(frameDocument.documentElement, { childList: true, subtree: true });

            } catch (e) {
              // Context verification fallback
            }
          }

          // Run injection loop at early frame cycles to catch scripts prior to execution
          frame.addEventListener('load', injectionRoutine);
          setInterval(injectionRoutine, 250);
        })();
      </script>
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
