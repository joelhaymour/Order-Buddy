"use client";

import { demoData } from "@/lib/demo-data";
import type { AppData } from "@/lib/types";

const STORAGE_KEY = "order-buddy-demo-data";

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeAppData(data: AppData): AppData {
  return {
    ...data,
    dropDays: data.dropDays.map((dropDay) => ({
      ...dropDay,
      archived: Boolean(dropDay.archived),
      customEvents: Array.isArray(dropDay.customEvents) ? dropDay.customEvents : [],
    })),
    products: data.products.map((product) => ({
      ...product,
      workflowAction: product.workflowAction ?? null,
    })),
  };
}

export function loadLocalData(): AppData {
  if (!canUseStorage()) {
    return normalizeAppData(demoData);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoData));
    return normalizeAppData(demoData);
  }

  try {
    return normalizeAppData(JSON.parse(raw) as AppData);
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoData));
    return normalizeAppData(demoData);
  }
}

export function saveLocalData(data: AppData) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
