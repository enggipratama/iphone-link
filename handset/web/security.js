// The server injects this page-scoped capability into trusted same-origin HTML.
// Keep it out of URLs and attach it only to requests back to this application.
(() => {
  const tokenElement = document.querySelector('meta[name="pane-api-token"]');
  const token = tokenElement?.content || "";
  if (!token || typeof window.fetch !== "function") return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let url;
    try {
      url = new URL(input instanceof Request ? input.url : input, window.location.href);
    } catch (_) {
      return nativeFetch(input, init);
    }

    const protectedPath =
      url.pathname === "/api" ||
      url.pathname.startsWith("/api/") ||
      url.pathname === "/mirror" ||
      url.pathname.startsWith("/mirror/") ||
      url.pathname === "/debug-metrics";
    if (url.origin !== window.location.origin || !protectedPath) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.set("X-Pane-Token", token);
    return nativeFetch(input, { ...(init || {}), headers });
  };
})();
