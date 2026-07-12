"use client";

import type {
  ActivityEntry,
  CalendarNoteEvent,
  DropDay,
  Product,
  ProductPriority,
  WorkflowAction,
} from "@/lib/types";
import { workflowActions } from "@/lib/types";

const META_PREFIX = "\n\n<!--ORDER_BUDDY_META:";
const META_SUFFIX = "-->";

type ProductMeta = {
  workflowAction?: WorkflowAction | null;
  nextAction?: string;
  owner?: string;
  priority?: ProductPriority;
  dueDate?: string | null;
  activity?: ActivityEntry[];
};

function isWorkflowAction(value: unknown): value is WorkflowAction {
  return typeof value === "string" && workflowActions.some((action) => action === value);
}

type DropMeta = {
  archived?: boolean;
  customEvents?: CalendarNoteEvent[];
};

function isCalendarNoteEvent(value: unknown): value is CalendarNoteEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    typeof event.title === "string" &&
    typeof event.notes === "string" &&
    typeof event.date === "string"
  );
}

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
  "notes" | "workflowAction" | "nextAction" | "owner" | "priority" | "dueDate" | "activity"
> {
  const { content, meta } = splitMetaValue(value);
  const productMeta = (meta as ProductMeta | null) ?? {};

  return {
    notes: content,
    workflowAction: isWorkflowAction(productMeta.workflowAction)
      ? productMeta.workflowAction
      : null,
    nextAction: productMeta.nextAction ?? "",
    owner: productMeta.owner ?? "",
    priority: productMeta.priority ?? "medium",
    dueDate: productMeta.dueDate ?? null,
    activity: Array.isArray(productMeta.activity) ? productMeta.activity : [],
  };
}

export function serializeProductNotes(product: Pick<
  Product,
  "notes" | "workflowAction" | "nextAction" | "owner" | "priority" | "dueDate" | "activity"
>) {
  return packMetaValue(product.notes, {
    workflowAction: product.workflowAction,
    nextAction: product.nextAction,
    owner: product.owner,
    priority: product.priority,
    dueDate: product.dueDate,
    activity: product.activity,
  });
}

export function parseDropDescription(value: string | null | undefined): Pick<
  DropDay,
  "description" | "archived" | "customEvents"
> {
  const { content, meta } = splitMetaValue(value);
  const dropMeta = (meta as DropMeta | null) ?? {};

  return {
    description: content,
    archived: Boolean(dropMeta.archived),
    customEvents: Array.isArray(dropMeta.customEvents)
      ? dropMeta.customEvents.filter(isCalendarNoteEvent)
      : [],
  };
}

export function serializeDropDescription(
  dropDay: Pick<DropDay, "description" | "archived" | "customEvents">,
) {
  return packMetaValue(dropDay.description, {
    archived: dropDay.archived,
    customEvents: dropDay.customEvents,
  });
}
