import http from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { catalog } from "./catalog.mjs";
import { home, detail, problem } from "./view.mjs";
export function createServer(api = catalog()) {
  return http.createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      const url = new URL(req.url, "http://localhost");
      if (!["GET", "HEAD"].includes(req.method))
        return send(405, "text/plain", "Method not allowed");
      if (
        url.pathname === "/style.css" ||
        /^\/art\/(tide|orbit|ridge|signal)\.png$/.test(url.pathname)
      ) {
        const file = await readFile(
          new URL("./public" + url.pathname, import.meta.url),
        );
        return send(
          200,
          url.pathname.endsWith("css") ? "text/css" : "image/png",
          file,
        );
      }
      const match = /^\/products\/([^/]+)$/.exec(url.pathname);
      if (url.pathname !== "/" && !match)
        return send(404, "text/html; charset=utf-8", problem(404));
      const shop = await api.connection();
      if (!match)
        return send(
          200,
          "text/html; charset=utf-8",
          home(shop, await api.list(), api.mode === "demo"),
        );
      const p = await api.product(decodeURIComponent(match[1]));
      return send(
        p ? 200 : 404,
        "text/html; charset=utf-8",
        p
          ? detail(
              shop,
              p,
              api.mode === "demo",
              url.searchParams.get("variant"),
            )
          : problem(404),
      );
    } catch {
      send(503, "text/html; charset=utf-8", problem(503));
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT || 4317),
    host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () =>
    console.log("Storefront listening at http://" + host + ":" + port),
  );
}
