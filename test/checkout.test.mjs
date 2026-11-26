import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../catalog.mjs";
import { createServer } from "../server.mjs";
test("guest cart, repricing, checkout replay, ownership and restart", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "fold-basket-"));
  const env = {
    UUCH_CHECKOUT_MODE: "sandbox",
    UUCH_CART_DB: join(dir, "test.db"),
  };
  const api = catalog({});
  let server, base, cookie;
  async function start() {
    server = createServer(api, env);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + server.address().port;
  }
  const stop = () => new Promise((resolve) => server.close(resolve));
  await start();
  t.after(async () => {
    await stop();
    await rm(dir, { recursive: true, force: true });
  });
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: { origin: base, ...(cookie && { cookie }) },
      body: body && new URLSearchParams(body),
      redirect: "manual",
    });
    const c = response.headers.get("set-cookie");
    if (c) cookie = c.split(";")[0];
    return response;
  }
  const item = { product: "tide", variant: "tide-a4", quantity: "1" };
  assert.equal((await request("/cart/add", item)).status, 303);
  await request("/cart/update", { ...item, quantity: "2" });
  let page = await (await request("/checkout")).text();
  const form = {
    recipient: "Test",
    email: "test@example.invalid",
    street: "Test",
    city: "London",
    postcode: "SW1",
    country: "GB",
    quote: /name="quote" value="([^"]+)/.exec(page)[1],
  };
  assert.match(page, /£58\.00/);
  const product = await api.product("tide");
  product.variants[0].price_minor = 3000;
  assert.equal((await request("/checkout", form)).status, 409);
  page = await (await request("/checkout")).text();
  form.quote = /name="quote" value="([^"]+)/.exec(page)[1];
  const [one, two] = await Promise.all([
    request("/checkout", form),
    request("/checkout", form),
  ]);
  const location = one.headers.get("location");
  assert.match(location, /^\/orders\/DEMO-/);
  assert.equal(two.headers.get("location"), location);
  await stop();
  await start();
  assert.match(await (await request(location)).text(), /£60\.00/);
  assert.match(await (await request("/cart")).text(), /购物车还是空的/);
  cookie = "";
  assert.equal((await request(location)).status, 404);
  await request("/cart/add", item);
  product.variants[0].availability = "unavailable";
  assert.equal((await request("/checkout")).headers.get("location"), "/cart");
  await request("/cart/update", { ...item, remove: "1" });
  assert.match(await (await request("/cart")).text(), /购物车还是空的/);
});

test("live checkout stays closed by default; cross-origin cart writes are refused", async (t) => {
  const api = { ...catalog({}), mode: "live" };
  const server = createServer(api, { UUCH_CART_DB: ":memory:" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  assert.equal((await fetch(base + "/checkout")).status, 403);
  const res = await fetch(base + "/cart/add", {
    method: "POST",
    headers: { origin: "https://elsewhere.example" },
    body: new URLSearchParams({ product: "tide", variant: "tide-a4", quantity: "1" }),
  });
  assert.equal(res.status, 403);
});
