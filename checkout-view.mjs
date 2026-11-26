import { escape, layout, money } from "./view.mjs";

const value = (amount, currency) =>
  money({ price_minor: amount, currency_code: currency });
const hidden = (k, v) =>
  `<input type="hidden" name="${k}" value="${escape(v)}">`;
function rows(cart, editable = false) {
  return cart.lines
    .map(
      (line) => `<article class="cart-row">
    <div><b>${escape(line.title)}</b><p>${escape(line.label)} · ${line.unit === null ? "价格不可用" : value(line.unit, cart.currency)} × ${line.quantity}${!line.available ? " · 已不可购买" : ""}</p></div>
    <div><b>${line.unit === null ? "—" : value(line.unit * line.quantity, cart.currency)}</b>
    ${
      editable
        ? `<form class="inline" method="post" action="/cart/update">
      ${hidden("product", line.product)}${hidden("variant", line.variant)}
      <label>数量 <input type="number" name="quantity" min="1" max="99" value="${line.quantity}" required></label>
      <button>更新</button><button name="remove" value="1" formnovalidate>移除</button></form>`
        : ""
    }</div>
    </article>`,
    )
    .join("");
}
export function cartPage(shop, cart, demo, checkout) {
  const content = cart.lines.length
    ? `${rows(cart, true)}<div class="total">商品小计 <b>${value(cart.total, cart.currency)}</b></div>
    ${cart.ready && checkout ? '<a class="primary" href="/checkout">去结算 →</a>' : `<p>${!cart.ready ? "请先移除不可购买的商品。" : "店铺尚未开通结算。"}</p>`}`
    : "<p>购物车还是空的。</p>";
  return layout(
    "购物车",
    shop.name,
    `<section class="purchase"><h1>购物车</h1>${content}<p><a href="/#collection">← 继续选购</a></p></section>`,
    demo,
  );
}
export function checkoutPage(shop, cart, demo) {
  return layout(
    "结算",
    shop.name,
    `<section class="purchase"><a href="/cart">← 返回购物车</a><h1>测试结算</h1>
    <p>演示订单使用模拟支付，运费与税费均为 0。可以直接使用下方示例收货资料，无实际扣款或发货。</p>
    ${rows(cart)}<div class="total">应付合计 <b>${value(cart.total, cart.currency)}</b></div>
    <form method="post" action="/checkout" class="delivery">${hidden("quote", cart.key)}
    <h2>收货资料</h2>
    <label>收件人<input name="recipient" value="Demo Buyer" maxlength="100" required></label>
    <label>联系邮箱<input type="email" name="email" value="buyer@example.invalid" maxlength="254" required></label>
    <label>街道地址<input name="street" value="1 Example Street" maxlength="200" required></label>
    <label>城市<input name="city" value="London" maxlength="100" required></label>
    <label>邮编<input name="postcode" value="SW1A 1AA" maxlength="20" required></label>
    <label>目的地<select name="country"><option value="GB">英国</option><option value="DE">德国</option></select></label>
    <button class="primary">确认测试付款 · ${value(cart.total, cart.currency)}</button></form></section>`,
    demo,
  );
}
export function receiptPage(shop, order, demo) {
  return layout(
    "测试订单已完成",
    shop.name,
    `<section class="purchase"><h1>测试订单已完成</h1><p>模拟付款成功 · 无实际扣款或发货</p>
    <p>订单号 <b>${escape(order.id)}</b></p>${rows(order)}<div class="total">模拟实付 <b>${value(order.total, order.currency)}</b></div><a href="/">继续选购 →</a></section>`,
    demo,
  );
}
