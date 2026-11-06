/**
 * Swagger UI page at /api-docs, built from /openapi.yaml (public/openapi.yaml). Public on purpose: it documents the endpoints only, and every
 * endpoint that touches private data still requires a signed-in session. Swagger UI is loaded from a pinned version on jsDelivr.
 * "Try it out" is limited to GET, so nothing destructive (account deletion, logout) can be fired from this page.
 */
const SWAGGER = "5.17.14";
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API docs · SmartFin AI</title>
<link rel="icon" href="/icon.svg">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER}/swagger-ui.css">
<style>
  body { margin: 0; background: #fafafa; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 20px; background: #1e1b4b; color: #fff; }
  .bar a { color: #c7d2fe; text-decoration: none; font-size: 14px; }
  .bar b { font-size: 16px; }
  .note { max-width: 1200px; margin: 12px auto 0; padding: 0 20px; color: #4b5563; font-size: 14px; }
  .note a { color: #4338ca; }
  /* The login is a browser cookie; the Authorize box cannot set it, so it would only confuse. Log in on the site, then use GET "Try it out". */
  .swagger-ui .auth-wrapper { display: none; }
</style>
</head>
<body>
<div class="bar"><b>SmartFin AI &middot; API docs</b><span><a href="/">Home</a> &nbsp;&middot;&nbsp; <a href="/openapi.yaml">openapi.yaml</a> &nbsp;&middot;&nbsp; <a href="https://github.com/KALYANSIDDAMALLA/smartfin-ai/blob/main/docs/API.md">Server actions</a></span></div>
<p class="note">These are the plain web endpoints. Most of the app runs as server actions, listed in <a href="https://github.com/KALYANSIDDAMALLA/smartfin-ai/blob/main/docs/API.md">docs/API.md</a>. Only GET requests can be tried here.</p>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER}/swagger-ui-bundle.js"></script>
<script>
  window.ui = SwaggerUIBundle({
    url: "/openapi.yaml", dom_id: "#swagger-ui", deepLinking: true, docExpansion: "list", defaultModelsExpandDepth: -1,
    supportedSubmitMethods: ["get"]
  });
</script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
