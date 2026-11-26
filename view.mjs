const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
function money(variant) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: variant.currency_code,
  }).format(variant.price_minor / 100);
}
const href = (product) => "/products/" + encodeURIComponent(product.id);

function artwork(product) {
  const url = product.images?.[0];
  const image =
    typeof url === "string" &&
    (/^https:\/\//i.test(url) || /^\/art\/[a-z]+\.png$/.test(url))
      ? `<img src="${escape(url)}" alt="${escape(product.title)}">`
      : '<div class="empty-art">暂无图片</div>';
  return `<div class="mount"><div class="paper">${image}</div></div>`;
}
function card(product) {
  const prices = product.variants.filter((v) =>
    Number.isSafeInteger(v.price_minor),
  );
  const lowest = prices.reduce(
    (min, v) => (!min || v.price_minor < min.price_minor ? v : min),
    null,
  );
  return `<a class="card" href="${href(product)}">
    ${artwork(product)}
    <div class="caption"><h3>${escape(product.title)}</h3><span>${lowest ? escape(money(lowest)) : "暂无价格"}</span></div>
    <small>${escape(product.subtitle)}</small></a>`;
}
function layout(title, brand, body, demo) {
  return `<!doctype html><html lang="zh-CN"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)}</title><link rel="stylesheet" href="/style.css"></head><body>
    <header><a class="brand" href="/"><b aria-hidden="true">◒</b> ${escape(brand)}</a>
    <nav><a href="/#collection">${demo ? "作品目录" : "商品目录"}</a>${demo ? "<span>样品店</span>" : ""}</nav></header>
    <main>${body}</main><footer>${escape(brand)}<a href="/#collection">返回目录 ↑</a></footer></body></html>`;
}
export function home(shop, items, demo) {
  const lead = items[0];
  const hero = lead
    ? `<section class="hero"><div class="lead">
    <small>${escape(demo ? "FOLD EDITIONS / 艺术微喷" : shop.name)}</small><h1>${escape(demo ? "纸上的风景" : lead.title)}</h1>
    ${demo ? "<p>以线条、色块与留白，记录日常风景。<br>发现折色工作室的原创版画。</p>" : ""}
    <a class="cta" href="#collection">${demo ? "浏览作品" : "浏览商品"} <i>↘</i></a></div>
    <a class="feature" href="${href(lead)}" aria-label="${escape(lead.title)}">${artwork(lead)}<span>${escape(lead.title)}</span></a></section>`
    : "";
  const collection = `<section id="collection"><div class="section-title"><h2>${demo ? "工作室作品" : "全部商品"}</h2><span>${items.length} 件</span></div>
    <div class="grid">${items.map(card).join("")}</div>${items.length ? "" : "<p>本店还没有上架商品。</p>"}</section>`;
  return layout(shop.name, shop.name, hero + collection, demo);
}
export function detail(shop, product, demo, variantId) {
  const chosen =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const options = product.variants.map(
    (v) =>
      `<a class="${v.id === chosen?.id ? "on" : ""}" href="${href(product)}?variant=${encodeURIComponent(v.id)}">${escape(v.label)}</a>`,
  );
  const offer = chosen
    ? `<strong class="price">${escape(money(chosen))}</strong><p>规格 · ${escape(chosen.label)}</p>
    <div class="variants">${options.join("")}</div><p>${chosen.availability === "available" ? "可供货" : "暂不可供货"}</p>`
    : "<p>暂无可展示规格</p>";
  return layout(
    product.title + " · " + shop.name,
    shop.name,
    `<a class="back" href="/#collection">← 返回目录</a>
    <section class="detail">${artwork(product)}<div><small>${escape(product.subtitle || shop.name)}</small>
    <h1>${escape(product.title)}</h1><p>${escape(product.description)}</p>${offer}</div></section>`,
    demo,
  );
}
export function problem(status) {
  return layout(
    String(status),
    "店铺",
    `<section class="notice"><h1>${status === 404 ? "商品已下架或不存在" : "店铺暂时无法读取"}</h1><a href="/">返回首页</a></section>`,
    false,
  );
}
