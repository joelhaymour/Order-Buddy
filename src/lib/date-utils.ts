import {
  addBusinessDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from "date-fns";

export function formatDate(date: string | null | undefined, fallback = "Not set") {
  if (!date) {
    return fallback;
  }

  const parsed = parseISO(date);
  if (!isValid(parsed)) {
    return fallback;
  }

  return format(parsed, "MMM d, yyyy");
}

export function calculateBulkReadyDate(
  bulkStartDate: string | null,
  productionDays: number,
) {
  if (!bulkStartDate || productionDays <= 0) {
    return null;
  }

  return format(addBusinessDays(parseISO(bulkStartDate), productionDays), "yyyy-MM-dd");
}

export function calculateBusinessDateFromStart(
  startDate: string | null,
  businessDays: number,
) {
  if (!startDate || businessDays <= 0) {
    return null;
  }

  return format(addBusinessDays(parseISO(startDate), businessDays), "yyyy-MM-dd");
}

export function calculateArrivalDate(
  bulkStartDate: string | null,
  productionDays: number,
  shippingDays: number,
) {
  const bulkReadyDate = calculateBulkReadyDate(bulkStartDate, productionDays);
  if (!bulkReadyDate || shippingDays <= 0) {
    return bulkReadyDate;
  }

  return calculateBusinessDateFromStart(bulkReadyDate, shippingDays);
}

export function calculateSampleArrivalDate(
  sampleOrderedAt: string | null,
  sampleProductionDays: number,
  sampleShippingDays: number,
) {
  const sampleReadyDate = calculateBusinessDateFromStart(
    sampleOrderedAt,
    sampleProductionDays,
  );

  if (!sampleReadyDate || sampleShippingDays <= 0) {
    return sampleReadyDate;
  }

  return calculateBusinessDateFromStart(sampleReadyDate, sampleShippingDays);
}

export function daysUntil(date: string | null | undefined) {
  if (!date) {
    return null;
  }

  const parsed = parseISO(date);
  if (!isValid(parsed)) {
    return null;
  }

  return differenceInCalendarDays(parsed, new Date());
}

export function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function clampNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}
