// Original sample prints. Amounts are in GBP pence.
export const studio = {
  store_id: "demo-fold",
  name: "折色工作室",
  currency_code: "GBP",
};
const editions = [
  [
    "tide",
    "潮汐",
    "Tidal Forms",
    "以重复的深蓝曲线，记录海面的缓慢起伏。",
    2900,
  ],
  [
    "orbit",
    "日轨",
    "Solar Orbit",
    "朱红色的圆与细密的轨迹，在纸面相遇。",
    3200,
  ],
  [
    "ridge",
    "山序",
    "Mountain Study",
    "层叠的山脊与松绿色块，构成一幅安静的风景。",
    2600,
  ],
  [
    "signal",
    "频谱",
    "Signal Field",
    "色带与留白交替排列，适合明亮的阅读角。",
    3400,
  ],
];
export function demoProducts() {
  return editions.map(([id, title, subtitle, description, price]) => ({
    id,
    title,
    subtitle,
    description,
    images: ["/art/" + id + ".png"],
    variants: [
      {
        id: id + "-a4",
        label: "A4 · 210 × 297 mm",
        price_minor: price,
        currency_code: "GBP",
        availability: "available",
      },
      {
        id: id + "-a3",
        label: "A3 · 297 × 420 mm",
        price_minor: price + 1000,
        currency_code: "GBP",
        availability: "available",
      },
    ],
  }));
}
