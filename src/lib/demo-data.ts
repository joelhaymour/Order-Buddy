import type { AppData, CostEntry, DropDay, Product } from "@/lib/types";

const today = new Date();
const iso = (daysFromNow: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
};

const dropDays: DropDay[] = [
  {
    id: "drop-august",
    name: "August Fairway Drop",
    targetDate: iso(48),
    description: "Late-summer polos and lightweight outerwear.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "drop-fall",
    name: "Fall Clubhouse Drop",
    targetDate: iso(94),
    description: "Cool-weather layers and premium basics.",
    createdAt: new Date().toISOString(),
  },
];

const products: Product[] = [
  {
    id: "prod-greenline-polo",
    name: "Greenline Performance Polo",
    sku: "GL-P01",
    category: "Polo",
    supplier: "Shenzhen Apparel Co.",
    status: "bulk",
    dropDayId: "drop-august",
    notes: "Approved sample after collar adjustment. Waiting on bulk run.",
    sampleOrderedAt: iso(-35),
    sampleApprovedAt: iso(-14),
    bulkStartDate: iso(-2),
    productionDays: 24,
    shippingDays: 12,
    targetLaunchDate: iso(48),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod-links-short",
    name: "Links 7in Short",
    sku: "LK-S07",
    category: "Short",
    supplier: "Ningbo Sportswear",
    status: "sample",
    dropDayId: "drop-august",
    notes: "Need to compare two fabric weights before approving.",
    sampleOrderedAt: iso(-9),
    sampleApprovedAt: null,
    bulkStartDate: null,
    productionDays: 0,
    shippingDays: 0,
    targetLaunchDate: iso(48),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod-bunker-quarterzip",
    name: "Bunker Quarter Zip",
    sku: "BQ-Z01",
    category: "Outerwear",
    supplier: "Hangzhou Knit House",
    status: "idea",
    dropDayId: "drop-fall",
    notes: "Still deciding between mock neck and standard quarter zip silhouette.",
    sampleOrderedAt: null,
    sampleApprovedAt: null,
    bulkStartDate: null,
    productionDays: 0,
    shippingDays: 0,
    targetLaunchDate: iso(94),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prod-range-cap",
    name: "Range Nylon Cap",
    sku: "RG-CAP",
    category: "Headwear",
    supplier: "Fujian Headwear",
    status: "canceled",
    dropDayId: null,
    notes: "Canceled due to minimums and embroidery quality issues.",
    sampleOrderedAt: iso(-21),
    sampleApprovedAt: null,
    bulkStartDate: null,
    productionDays: 0,
    shippingDays: 0,
    targetLaunchDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const costEntries: CostEntry[] = [
  {
    id: "cost-1",
    productId: "prod-greenline-polo",
    title: "Sample",
    description: "Initial pre-production sample",
    amount: 135,
    entryDate: iso(-34),
    costType: "sample",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cost-2",
    productId: "prod-greenline-polo",
    title: "Fabric deposit",
    description: "Performance knit fabric reservation",
    amount: 420,
    entryDate: iso(-6),
    costType: "materials",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cost-3",
    productId: "prod-greenline-polo",
    title: "Ocean freight estimate",
    description: "Projected bulk shipping cost",
    amount: 210,
    entryDate: iso(22),
    costType: "freight",
    createdAt: new Date().toISOString(),
  },
  {
    id: "cost-4",
    productId: "prod-links-short",
    title: "Fit sample",
    description: "Two colorways for review",
    amount: 96,
    entryDate: iso(-8),
    costType: "sample",
    createdAt: new Date().toISOString(),
  },
];

export const demoData: AppData = {
  dropDays,
  products,
  costEntries,
};
