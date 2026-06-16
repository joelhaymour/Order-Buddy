"use client";

import { demoData } from "@/lib/demo-data";
import type { AppData } from "@/lib/types";

const STORAGE_KEY = "order-buddy-demo-data";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function loadLocalData(): AppData {
  if (!canUseStorage()) {
    return demoData;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoData));
    return demoData;
  }

  try {
    return JSON.parse(raw) as AppData;
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demoData));
    return demoData;
  }
}

export function saveLocalData(data: AppData) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
