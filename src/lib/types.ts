export const productStatuses = [
  "idea",
  "sample",
  "bulk",
  "canceled",
] as const;

export const costTypes = [
  "sample",
  "materials",
  "packaging",
  "freight",
  "misc",
] as const;

export type ProductStatus = (typeof productStatuses)[number];
export type CostType = (typeof costTypes)[number];

export type UserRecord = {
  id: string;
  email: string;
  fullName: string;
};

export type DropDay = {
  id: string;
  name: string;
  targetDate: string;
  description: string;
  createdAt: string;
};

export type CostEntry = {
  id: string;
  productId: string;
  title: string;
  description: string;
  amount: number;
  entryDate: string;
  costType: CostType;
  createdAt: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  imagePath: string | null;
  status: ProductStatus;
  dropDayId: string | null;
  notes: string;
  sampleOrderedAt: string | null;
  sampleProductionDays: number;
  sampleShippingDays: number;
  bulkStartDate: string | null;
  productionDays: number;
  shippingDays: number;
  targetLaunchDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductWithCosts = Product & {
  costs: CostEntry[];
};

export type AppData = {
  dropDays: DropDay[];
  products: Product[];
  costEntries: CostEntry[];
};

export type ProductDraft = {
  name: string;
  sku: string;
  category: string;
  supplier: string;
  imagePath: string | null;
  status: ProductStatus;
  dropDayId: string | null;
  notes: string;
  sampleOrderedAt: string | null;
  sampleProductionDays: number;
  sampleShippingDays: number;
  bulkStartDate: string | null;
  productionDays: number;
  shippingDays: number;
  targetLaunchDate: string | null;
};

export type DropDayDraft = {
  name: string;
  targetDate: string;
  description: string;
};

export type CostEntryDraft = {
  title: string;
  description: string;
  amount: number;
  entryDate: string;
  costType: CostType;
};

export type AuthMode = "demo" | "supabase";
