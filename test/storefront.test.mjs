import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../catalog.mjs";
import { createServer } from "../server.mjs";

const config = {
  UUCH_STOREFRONT_MODE: "live",
  UUCH_API_BASE_URL: "https://api.example/open/v1",
  UUCH_EXPECTED_STORE_ID: "shop-A",
  UUCH_STOREFRONT_TOKEN: "test-only",
};
const json = (value) => Response.json(value);
test("demo works offline and includes original options and retail prices", async () => {
  const api = catalog({});
  const list = await api.list();
  assert.equal(list.length, 4);
  assert.equal((await api.product("tide")).variants[1].price_minor, 3900);
  assert.equal(await api.product("missing"), null);
});
test("a wrong store key or an upstream failure never displays sample merchandise", async () => {
  await assert.rejects(
    catalog(config, async () => json({ store_id: "shop-B" })).connection(),
    /mismatch/,
  );
  await assert.rejects(
    catalog(config, async () => new Response(null, { status: 403 })).list(),
    /403/,
  );
  assert.throws(() => catalog({ UUCH_STOREFRONT_MODE: "live" }), /Missing/);
});
test("follows cursor pages and keeps the credential in the server request", async () => {
  const calls = [];
  const api = catalog(config, async (url, init) => {
    calls.push(url);
    assert.equal(init.headers.Authorization, "Bearer test-only");
    assert.equal(init.redirect, "error");
    return json({
      store_id: "shop-A",
      products: [{ id: String(calls.length) }],
      next_cursor: calls.length === 1 ? "3:25" : null,
    });
  });
  assert.deepEqual(
    (await api.list()).map((p) => p.id),
    ["1", "2"],
  );
  assert.match(calls[1], /cursor=3%3A25/);
});
test("serves the storefront, each SKU, original image, and a real missing-product 404", async (t) => {
  const server = createServer(catalog({}));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port;
  const home = await fetch(origin);
  assert.match(await home.text(), /折色工作室/);
  assert.equal(home.headers.get("cache-control"), "no-store");
  assert.match(
    await (await fetch(origin + "/products/tide?variant=tide-a3")).text(),
    /£39/,
  );
  assert.equal(
    (await fetch(origin + "/art/tide.png")).headers.get("content-type"),
    "image/png",
  );
  assert.equal((await fetch(origin + "/products/missing")).status, 404);
});
