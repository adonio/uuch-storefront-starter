import { catalog } from "./catalog.mjs";
try {
  const api = catalog();
  const info = await api.connection();
  const products = await api.list();
  console.log(
    api.mode,
    info.name,
    info.store_id,
    products.length + " published products",
  );
} catch (error) {
  console.error("Storefront connection failed:", error.message);
  process.exitCode = 1;
}
