import { demoProducts, studio } from "./demo.mjs";

export class CatalogError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}
export function catalog(env = process.env, request = fetch) {
  const mode = env.UUCH_STOREFRONT_MODE ?? "demo";
  if (mode === "demo") {
    const items = demoProducts();
    return {
      mode,
      connection: async () => ({ ...studio, product_count: items.length }),
      list: async () => items,
      product: async (id) => items.find((p) => p.id === id) ?? null,
    };
  }
  if (mode !== "live") throw new CatalogError("Invalid UUCH_STOREFRONT_MODE");
  if (
    !env.UUCH_API_BASE_URL ||
    !env.UUCH_EXPECTED_STORE_ID ||
    !env.UUCH_STOREFRONT_TOKEN
  )
    throw new CatalogError("Missing live store configuration");
  const base = new URL(env.UUCH_API_BASE_URL);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    )
  )
    throw new CatalogError("Store API requires HTTPS");
  const origin = env.STOREFRONT_ORIGIN ? new URL(env.STOREFRONT_ORIGIN) : null;
  if (
    origin &&
    (origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash)
  )
    throw new CatalogError("Invalid HTTPS storefront origin");
  async function get(path) {
    const url = base.href.replace(/\/$/, "") + "/storefront/" + path;
    const res = await request(url, {
      headers: { Authorization: "Bearer " + env.UUCH_STOREFRONT_TOKEN },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok)
      throw new CatalogError(
        "UUCH catalog returned HTTP " + res.status,
        res.status,
      );
    const data = await res.json();
    if (data.store_id !== env.UUCH_EXPECTED_STORE_ID)
      throw new CatalogError("Store ID mismatch");
    if (path === "connection" && origin && data.domain !== origin.hostname)
      throw new CatalogError("Verified store domain mismatch");
    return data;
  }
  return {
    mode,
    connection: () => get("connection"),
    list: async () => {
      const items = [];
      let cursor;
      const seen = new Set();
      do {
        const page = await get(
          "products" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        );
        if (!Array.isArray(page.products))
          throw new CatalogError("Invalid catalog response");
        items.push(...page.products);
        cursor = page.next_cursor;
        if (cursor && seen.has(cursor))
          throw new CatalogError("Repeated catalog cursor");
        seen.add(cursor);
      } while (cursor);
      return items;
    },
    product: async (id) => {
      try {
        return (await get("products/" + encodeURIComponent(id))).product;
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
  };
}
