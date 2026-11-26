import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { catalog } from "./catalog.mjs";
import { home, detail, problem, escape, layout } from "./view.mjs";
import { openBasket, pricedBasket, BasketError } from "./basket.mjs";
import { cartPage, checkoutPage, receiptPage } from "./checkout-view.mjs";

async function form(req) {
  if (
    req.headers["content-type"]?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw new BasketError("表单格式不正确。", 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new BasketError("表单过长。", 413);
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
function ownerFor(req, res, shop, secure) {
  const name =
    "fold_cart_" +
    createHash("sha256").update(shop.store_id).digest("hex").slice(0, 16);
  const cookie = (req.headers.cookie ?? "")
    .split(/;\s*/)
    .find((pair) => pair.startsWith(name + "="));
  let key = cookie?.slice(name.length + 1);
  if (!/^[a-f0-9]{64}$/.test(key ?? "")) {
    key = randomBytes(32).toString("hex");
    res.setHeader(
      "Set-Cookie",
      name +
        "=" +
        key +
        "; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000" +
        (secure ? "; Secure" : ""),
    );
  }
  return shop.store_id + ":" + key;
}
function validateDelivery(data) {
  for (const [key, max] of Object.entries({
    recipient: 100,
    email: 254,
    street: 200,
    city: 100,
    postcode: 20,
  })) {
    const input = data.get(key)?.trim();
    if (!input || input.length > max) throw new BasketError("请补全收货资料。");
  }
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.get("email")) ||
    !["GB", "DE"].includes(data.get("country"))
  )
    throw new BasketError("请核对邮箱和配送国家。");
}

export function createServer(api = catalog(), env = process.env) {
  const sandbox =
    env.UUCH_CHECKOUT_MODE ?? (api.mode === "demo" ? "sandbox" : "off");
  if (!["off", "sandbox"].includes(sandbox))
    throw new Error("Invalid UUCH_CHECKOUT_MODE");
  let baskets;
  const storage = () =>
    (baskets ??= openBasket(env.UUCH_CART_DB || ".local/storefront.sqlite"));
  const server = http.createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    const html = (status, body) =>
      send(status, "text/html; charset=utf-8", body);
    const redirect = (location) => {
      res.writeHead(303, { Location: location, "Cache-Control": "no-store" });
      res.end();
    };
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const post = req.method === "POST";
      if (!post && !["GET", "HEAD"].includes(req.method))
        return send(405, "text/plain", "Method not allowed");
      if (
        !post &&
        (path === "/style.css" ||
          /^\/art\/(tide|orbit|ridge|signal)\.png$/.test(path))
      ) {
        return send(
          200,
          path.endsWith("css") ? "text/css" : "image/png",
          await readFile(new URL("./public" + path, import.meta.url)),
        );
      }
      const productMatch = /^\/products\/([^/]+)$/.exec(path);
      const orderMatch = /^\/orders\/(DEMO-[A-F0-9]{20})$/.exec(path);
      if (post) {
        if (!["/checkout", "/cart/add", "/cart/update"].includes(path))
          return html(405, problem(404));
        const allowed = env.STOREFRONT_ORIGIN
          ? [new URL(env.STOREFRONT_ORIGIN).origin]
          : ["https://" + req.headers.host, "http://" + req.headers.host];
        if (!allowed.includes(req.headers.origin))
          throw new BasketError("请从本店页面提交。", 403);
      } else if (
        !productMatch &&
        !orderMatch &&
        !["/", "/cart", "/checkout"].includes(path)
      )
        return html(404, problem(404));
      const shop = await api.connection();
      const demo = api.mode === "demo";
      if (path === "/") return html(200, home(shop, await api.list(), demo));
      if (productMatch) {
        const product = await api.product(decodeURIComponent(productMatch[1]));
        return product
          ? html(
              200,
              detail(shop, product, demo, url.searchParams.get("variant")),
            )
          : html(404, problem(404));
      }
      const owner = ownerFor(
        req,
        res,
        shop,
        env.STOREFRONT_ORIGIN?.startsWith("https://"),
      );
      const store = storage();
      if (orderMatch) {
        const order = store.order(owner, orderMatch[1]);
        return order
          ? html(200, receiptPage(shop, order, demo))
          : html(404, layout("订单", "店铺", "<p>找不到该订单。</p>", demo));
      }
      if (path === "/checkout" && sandbox !== "sandbox")
        throw new BasketError("这家店尚未开通结算。", 403);
      const data = post ? await form(req) : null;
      if (path === "/cart/add" || path === "/cart/update") {
        const id = data.get("product"),
          sku = data.get("variant");
        const remove = data.get("remove") === "1";
        if (path === "/cart/add" || !remove) {
          const product = await api.product(id);
          const v = product?.variants.find((v) => v.id === sku);
          if (v?.availability !== "available")
            throw new BasketError("该规格已下架或缺货。", 409);
        }
        store.change(
          owner,
          id,
          sku,
          remove ? 0 : Number(data.get("quantity")),
          path === "/cart/add",
        );
        return redirect("/cart");
      }
      if (post) {
        const existing = store.prior(owner, data.get("quote") ?? "");
        if (existing) return redirect("/orders/" + existing);
        validateDelivery(data);
      }
      const quote = await pricedBasket(api, shop, store.read(owner));
      if (path === "/cart")
        return html(200, cartPage(shop, quote, demo, sandbox === "sandbox"));
      if (!post)
        return quote.ready
          ? html(200, checkoutPage(shop, quote, demo))
          : redirect("/cart");
      const id = store.place(owner, data.get("quote"), quote);
      return redirect("/orders/" + id);
    } catch (error) {
      if (error instanceof BasketError)
        return html(
          error.status,
          layout(
            "订单提示",
            "店铺",
            `<section class="purchase"><p>${escape(error.message)}</p><a href="/cart">返回购物车 →</a></section>`,
            api.mode === "demo",
          ),
        );
      return html(503, problem(503));
    }
  });
  server.on("close", () => baskets?.close());
  return server;
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
