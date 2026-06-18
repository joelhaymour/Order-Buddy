"use client";

import type { ActivityEntry, DropDay, Product, ProductPriority } from "@/lib/types";

const META_PREFIX = "\n\n<!--ORDER_BUDDY_META:";
const META_SUFFIX = "-->";

type ProductMeta = {
  nextAction?: string;
  owner?: string;
  priority?: ProductPriority;
  dueDate?: string | null;
  activity?: ActivityEntry[];
};

type DropMeta = {
  archived?: boolean;
};

function splitMetaValue(value: string | null | undefined) {
  const source = value ?? "";
  const start = source.lastIndexOf(META_PREFIX);
  const end = source.endsWith(META_SUFFIX) ? source.length - META_SUFFIX.length : -1;

  if (start === -1 || end === -1 || end <= start) {
    return {
      content: source,
      meta: null as unknown,
    };
  }

  const content = source.slice(0, start).trimEnd();
  const rawMeta = source.slice(start + META_PREFIX.length, end);

  try {
    return {
      content,
      meta: JSON.parse(rawMeta) as unknown,
    };
  } catch {
    return {
      content: source,
      meta: null as unknown,
    };
  }
}

function packMetaValue(content: string, meta: unknown) {
  return `${content.trimEnd()}${META_PREFIX}${JSON.stringify(meta)}${META_SUFFIX}`;
}

export function parseProductNotes(value: string | null | undefined): Pick<
  Product,
  "notes" | "nextAction" | "owner" | "priority" | "dueDate" | "activity"
> {
  const { content, meta } = splitMetaValue(value);
  const productMeta = (meta as ProductMeta | null) ?? {};

  return {
    notes: content,
    nextAction: productMeta.nextAction ?? "",
    owner: productMeta.owner ?? "",
    priority: productMeta.priority ?? "medium",
    dueDate: productMeta.dueDate ?? null,
    activity: Array.isArray(productMeta.activity) ? productMeta.activity : [],
  };
}

export function serializeProductNotes(product: Pick<
  Product,
  "notes" | "nextAction" | "owner" | "priority" | "dueDate" | "activity"
>) {
  return packMetaValue(product.notes, {
    nextAction: product.nextAction,
    owner: product.owner,
    priority: product.priority,
    dueDate: product.dueDate,
    activity: product.activity,
  });
}

export function parseDropDescription(value: string | null | undefined): Pick<
  DropDay,
  "description" | "archived"
> {
  const { content, meta } = splitMetaValue(value);
  const dropMeta = (meta as DropMeta | null) ?? {};

  return {
    description: content,
    archived: Boolean(dropMeta.archived),
  };
}

export function serializeDropDescription(dropDay: Pick<DropDay, "description" | "archived">) {
  return packMetaValue(dropDay.description, {
    archived: dropDay.archived,
  });
}
