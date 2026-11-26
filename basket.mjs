import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export class BasketError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function openBasket(file) {
  if (file !== ":memory:")
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS baskets (owner TEXT PRIMARY KEY, revision TEXT NOT NULL, lines TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sample_orders (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, quote TEXT NOT NULL, summary TEXT NOT NULL, UNIQUE(owner,quote));`);
  function read(owner) {
    const row = db.prepare("SELECT * FROM baskets WHERE owner=?").get(owner);
    return row
      ? { revision: row.revision, lines: JSON.parse(row.lines) }
      : { revision: "", lines: [] };
  }
  function write(owner, lines) {
    db.prepare(
      "INSERT INTO baskets VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision, lines=excluded.lines",
    ).run(owner, randomBytes(16).toString("hex"), JSON.stringify(lines));
  }
  function transaction(operation) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function prior(owner, quote) {
    return db
      .prepare("SELECT id FROM sample_orders WHERE owner=? AND quote=?")
      .get(owner, quote)?.id;
  }
  return {
    read,
    prior,
    close: () => db.close(),
    change(owner, product, variant, quantity, add) {
      if (
        !Number.isInteger(quantity) ||
        quantity < (add ? 1 : 0) ||
        quantity > 99
      )
        throw new BasketError("数量须为 1 至 99 件，移除时选 0。");
      transaction(() => {
        const { lines } = read(owner);
        const index = lines.findIndex(
          (x) => x.product === product && x.variant === variant,
        );
        if (index < 0 && !add)
          throw new BasketError("购物车已更新，请刷新。", 409);
        const count =
          quantity + (add && index >= 0 ? lines[index].quantity : 0);
        if (count > 99 || (index < 0 && lines.length >= 50))
          throw new BasketError("购物车最多 50 款，每个规格最多 99 件。");
        if (!count) lines.splice(index, 1);
        else if (index >= 0) lines[index].quantity = count;
        else lines.push({ product, variant, quantity: count });
        write(owner, lines);
      });
    },
    place(owner, submitted, quote) {
      return transaction(() => {
        const existing = prior(owner, submitted);
        if (existing) return existing;
        if (
          !quote.ready ||
          submitted !== quote.key ||
          read(owner).revision !== quote.revision
        )
          throw new BasketError(
            "购物车、售价或供货状态已变化，请重新核对结算金额。",
            409,
          );
        const id = "DEMO-" + randomBytes(10).toString("hex").toUpperCase();
        const summary = {
          id,
          created_at: new Date().toISOString(),
          lines: quote.lines,
          total: quote.total,
          currency: quote.currency,
        };
        db.prepare("INSERT INTO sample_orders VALUES(?,?,?,?)").run(
          id,
          owner,
          submitted,
          JSON.stringify(summary),
        );
        write(owner, []);
        return id;
      });
    },
    order(owner, id) {
      const row = db
        .prepare("SELECT summary FROM sample_orders WHERE owner=? AND id=?")
        .get(owner, id);
      return row ? JSON.parse(row.summary) : null;
    },
  };
}

export async function pricedBasket(api, shop, basket) {
  const products = basket.lines.length ? await api.list() : [];
  const currency = shop.currency_code.toUpperCase();
  const lines = basket.lines.map((line) => {
    const p = products.find((p) => p.id === line.product);
    const v = p?.variants.find((v) => v.id === line.variant);
    const valid =
      Number.isSafeInteger(v?.price_minor) &&
      v.price_minor > 0 &&
      v.currency_code.toUpperCase() === currency;
    return {
      ...line,
      title: p?.title ?? "已下架商品",
      label: v?.label ?? "规格已移除",
      unit: valid ? v.price_minor : null,
      available: valid && v.availability === "available",
    };
  });
  const ready = lines.length > 0 && lines.every((l) => l.available);
  const total = lines.reduce((sum, l) => sum + (l.unit ?? 0) * l.quantity, 0);
  const key = createHash("sha256")
    .update(JSON.stringify([shop.store_id, basket.revision, currency, lines]))
    .digest("hex");
  return { lines, ready, total, currency, revision: basket.revision, key };
}
