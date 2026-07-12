import {
  calculateArrivalDate,
  calculateBulkReadyDate,
  calculateSampleArrivalDate,
  clampNumber,
} from "@/lib/date-utils";
import type {
  AppData,
  CostEntry,
  DropDay,
  Product,
  ProductStatus,
  ProductWithCosts,
} from "@/lib/types";

export function attachCosts(
  products: Product[],
  costEntries: CostEntry[],
  totals?: Record<string, number> | null,
) {
  return products.map((product) => ({
    ...product,
    costs: costEntries.filter((cost) => cost.productId === product.id),
    totalCost:
      totals === undefined
        ? costEntries
            .filter((cost) => cost.productId === product.id)
            .reduce((sum, cost) => sum + clampNumber(cost.amount), 0)
        : totals?.[product.id] ?? null,
  }));
}

export function getProductTotalCost(product: ProductWithCosts) {
  return product.totalCost ?? 0;
}

export function getStatusLabel(status: ProductStatus) {
  switch (status) {
    case "idea":
      return "Idea";
    case "sample":
      return "Sample";
    case "bulk":
      return "Bulk";
    case "launched":
      return "Launched";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
}

export function getDropDayName(dropDays: DropDay[], dropDayId: string | null) {
  if (!dropDayId) {
    return "No drop assigned";
  }

  return dropDays.find((drop) => drop.id === dropDayId)?.name ?? "Unknown drop";
}

export function getProductTimeline(product: Product) {
  const sampleArrivalDate = calculateSampleArrivalDate(
    product.sampleOrderedAt,
    product.sampleProductionDays,
    product.sampleShippingDays,
  );
  const bulkReadyDate = calculateBulkReadyDate(
    product.bulkStartDate,
    product.productionDays,
  );
  const arrivalDate = calculateArrivalDate(
    product.bulkStartDate,
    product.productionDays,
    product.shippingDays,
  );

  return {
    sampleArrivalDate,
    bulkReadyDate,
    arrivalDate,
  };
}

export function sortByDate<T extends { [key: string]: string | null }>(
  items: T[],
  key: keyof T,
) {
  return [...items].sort((a, b) => {
    const left = a[key] ?? "";
    const right = b[key] ?? "";
    return left.localeCompare(right);
  });
}

export function createEmptyAppData(): AppData {
  return {
    dropDays: [],
    products: [],
    costEntries: [],
  };
}
