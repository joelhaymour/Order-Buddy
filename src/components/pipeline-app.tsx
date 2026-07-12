"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subBusinessDays,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers3,
  LogOut,
  Package2,
  Plus,
  Receipt,
  Target,
  Truck,
} from "lucide-react";

import {
  calculateArrivalDate,
  calculateSampleArrivalDate,
  calculateBulkReadyDate,
  currency,
  daysUntil,
  formatDate,
} from "@/lib/date-utils";
import { loadLocalData, saveLocalData } from "@/lib/local-store";
import {
  attachCosts,
  createEmptyAppData,
  getDropDayName,
  getProductTimeline,
  getProductTotalCost,
  getStatusLabel,
} from "@/lib/pipeline-helpers";
import {
  getProductImageUrl,
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  productImagesBucket,
} from "@/lib/supabase";
import type {
  ActivityEntry,
  CalendarNoteEvent,
  AppData,
  AuthMode,
  CostEntry,
  CostEntryDraft,
  DropDay,
  DropDayDraft,
  Product,
  ProductPriority,
  ProductDraft,
  ProductStatus,
  ProductWithCosts,
  WorkflowAction,
} from "@/lib/types";
import { costTypes, productStatuses, workflowActions } from "@/lib/types";
import {
  parseDropDescription,
  parseProductNotes,
  serializeDropDescription,
  serializeProductNotes,
} from "@/lib/workflow-meta";
import { cn, createId } from "@/lib/utils";

type View = "dashboard" | "products" | "calendar" | "drops";
type Scope = "all" | string;
type ProductLayout = "board" | "list";
type ProductSort = "next-action" | "name" | "cost-high" | "newest";
type ProductStatusFilter = "all" | ProductStatus;
type CalendarItemType = "sample" | "drop" | "bulk" | "arrival" | "drop-day" | "custom";
type CalendarItemKind =
  | "sample-arrival"
  | "launch"
  | "bulk-ready"
  | "arrival"
  | "drop-day"
  | "custom-event";
type CalendarItem = {
  id: string;
  date: string;
  label: string;
  type: CalendarItemType;
  kind: CalendarItemKind;
  productId: string | null;
  draggable: boolean;
  dropDayId: string | null;
  notes?: string;
};
type DrawerTab = "overview" | "timeline" | "costs" | "activity";
type SavedFilter = {
  id: string;
  name: string;
  search: string;
  status: ProductStatusFilter;
  category: string;
  sort: ProductSort;
};
type CostEditorState = {
  id: string | null;
  draft: CostEntryDraft;
};
type CalendarEventDraft = {
  id: string | null;
  dropDayId: string;
  title: string;
  notes: string;
  date: string;
};
type PlanningAgendaItem = {
  id: string;
  productId: string;
  title: string;
  detail: string;
  date: string;
  status: "late" | "soon" | "planned";
};

type DropDayRow = {
  id: string;
  name: string;
  target_date: string;
  description: string | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  supplier: string;
  image_path: string | null;
  status: ProductStatus;
  drop_day_id: string | null;
  notes: string | null;
  sample_ordered_at: string | null;
  sample_production_days: number | null;
  sample_shipping_days: number | null;
  bulk_start_date: string | null;
  production_days: number | null;
  shipping_days: number | null;
  target_launch_date: string | null;
  created_at: string;
  updated_at: string;
};

type CostEntryRow = {
  id: string;
  product_id: string;
  title: string;
  description: string | null;
  amount: number;
  entry_date: string;
  cost_type: CostEntry["costType"];
  created_at: string;
};

const productPriorityOptions: { value: ProductPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const workflowActionLabels: Record<WorkflowAction, string> = {
  "order-first-sample": "Order first sample",
  "first-sample-ordered": "First sample ordered",
  "sample-revision": "Sample revision",
  "bulk-ordered": "Bulk ordered",
  "track-delivery": "Track delivery",
  "bulk-received": "Bulk received",
  launched: "Launched",
};

const workflowActionOptions = [
  { value: "", label: "Automatic (recommended)" },
  ...workflowActions.map((action) => ({
    value: action,
    label: workflowActionLabels[action],
  })),
];

const SAVED_FILTERS_KEY = "order-buddy-saved-filters";
const SAMPLE_REVIEW_BUFFER_DAYS = 3;

const navItems: { id: View; label: string; icon: typeof Layers3 }[] = [
  { id: "dashboard", label: "Dashboard", icon: Layers3 },
  { id: "products", label: "All Products", icon: Package2 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "drops", label: "Drop Days", icon: Target },
];

const emptyProductDraft: ProductDraft = {
  name: "",
  sku: "",
  category: "",
  supplier: "",
  imagePath: null,
  status: "idea",
  dropDayId: null,
  notes: "",
  sampleOrderedAt: null,
  sampleProductionDays: 0,
  sampleShippingDays: 0,
  bulkStartDate: null,
  productionDays: 0,
  shippingDays: 0,
  targetLaunchDate: null,
  workflowAction: null,
  nextAction: "",
  owner: "",
  priority: "medium",
  dueDate: null,
  activity: [],
};

const emptyDropDayDraft: DropDayDraft = {
  name: "",
  targetDate: "",
  description: "",
};

const emptyCostDraft: CostEntryDraft = {
  title: "",
  description: "",
  amount: 0,
  entryDate: new Date().toISOString().slice(0, 10),
  costType: "misc",
};

const emptyCalendarEventDraft: CalendarEventDraft = {
  id: null,
  dropDayId: "",
  title: "",
  notes: "",
  date: new Date().toISOString().slice(0, 10),
};

function mapDropDayRow(row: DropDayRow): DropDay {
  const dropMeta = parseDropDescription(row.description);
  return {
    id: row.id,
    name: row.name,
    targetDate: row.target_date,
    description: dropMeta.description,
    archived: dropMeta.archived,
    customEvents: dropMeta.customEvents,
    createdAt: row.created_at,
  };
}

function mapProductRow(row: ProductRow): Product {
  const workflowMeta = parseProductNotes(row.notes);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    supplier: row.supplier,
    imagePath: row.image_path,
    status: row.status,
    dropDayId: row.drop_day_id,
    notes: workflowMeta.notes,
    sampleOrderedAt: row.sample_ordered_at,
    sampleProductionDays: row.sample_production_days ?? 0,
    sampleShippingDays: row.sample_shipping_days ?? 0,
    bulkStartDate: row.bulk_start_date,
    productionDays: row.production_days ?? 0,
    shippingDays: row.shipping_days ?? 0,
    targetLaunchDate: row.target_launch_date,
    workflowAction: workflowMeta.workflowAction,
    nextAction: workflowMeta.nextAction,
    owner: workflowMeta.owner,
    priority: workflowMeta.priority,
    dueDate: workflowMeta.dueDate,
    activity: workflowMeta.activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCostRow(row: CostEntryRow): CostEntry {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    description: row.description ?? "",
    amount: row.amount,
    entryDate: row.entry_date,
    costType: row.cost_type,
    createdAt: row.created_at,
  };
}

function toProductRow(product: Product) {
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    supplier: product.supplier,
    image_path: product.imagePath,
    status: product.status,
    drop_day_id: product.dropDayId,
    notes: serializeProductNotes(product),
    sample_ordered_at: product.sampleOrderedAt,
    sample_production_days: product.sampleProductionDays,
    sample_shipping_days: product.sampleShippingDays,
    bulk_start_date: product.bulkStartDate,
    production_days: product.productionDays,
    shipping_days: product.shippingDays,
    target_launch_date: product.targetLaunchDate,
    updated_at: new Date().toISOString(),
  };
}

function getScopeLabel(scope: Scope, dropDays: DropDay[]) {
  if (scope === "all") {
    return "All products";
  }

  return dropDays.find((drop) => drop.id === scope)?.name ?? "Selected drop";
}

function getAssignedDropDate(dropDays: DropDay[], dropDayId: string | null) {
  if (!dropDayId) {
    return null;
  }

  return dropDays.find((drop) => drop.id === dropDayId)?.targetDate ?? null;
}

function getProductPrimaryMilestone(product: Product, dropDays: DropDay[]) {
  const timeline = getProductTimeline(product);
  const assignedDropDate = getAssignedDropDate(dropDays, product.dropDayId);

  if (product.status === "idea") {
    return {
      label: "Target drop",
      date: assignedDropDate,
    };
  }

  if (product.status === "sample") {
    return {
      label: "Sample arrival",
      date: timeline.sampleArrivalDate,
    };
  }

  if (product.status === "bulk") {
    return timeline.arrivalDate
      ? {
          label: "Arrival",
          date: timeline.arrivalDate,
        }
      : {
          label: "Bulk ready",
          date: timeline.bulkReadyDate,
        };
  }

  if (product.status === "launched") {
    return {
      label: "Launch date",
      date: assignedDropDate,
    };
  }

  return {
    label: "Last update",
    date: product.updatedAt.slice(0, 10),
  };
}

function getAutomaticProductNextAction(product: Product) {
  const timeline = getProductTimeline(product);

  if (product.status === "idea") {
    return "Order first sample";
  }

  if (product.status === "sample") {
    if (!product.sampleOrderedAt) {
      return "Add sample order date";
    }

    if (!timeline.sampleArrivalDate) {
      return "Add sample timing";
    }

    return "Review sample";
  }

  if (product.status === "bulk") {
    if (!product.bulkStartDate) {
      return "Set bulk start";
    }

    if (!timeline.arrivalDate) {
      return "Add shipping timing";
    }

    return "Track delivery";
  }

  if (product.status === "launched") {
    return "Launched";
  }

  return "No action";
}

function getProductNextAction(product: Product) {
  if (product.nextAction.trim()) {
    return product.nextAction.trim();
  }

  if (product.workflowAction) {
    return workflowActionLabels[product.workflowAction];
  }

  return getAutomaticProductNextAction(product);
}

function getPriorityBadgeClasses(priority: ProductPriority) {
  switch (priority) {
    case "urgent":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "high":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "medium":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "low":
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function getUrgencyTone(product: Product, dropDays: DropDay[]) {
  const referenceDate = product.dueDate ?? getProductSortDate(product, dropDays);
  const days = daysUntil(referenceDate);

  if (days === null) {
    return "border-slate-200";
  }

  if (days < 0) {
    return "border-l-2 border-l-rose-400 bg-rose-50";
  }

  if (days <= 5) {
    return "border-l-2 border-l-amber-400 bg-amber-50";
  }

  return "border-l-2 border-l-cyan-400 bg-cyan-50/60";
}

function buildActivityEntry(message: string, user: string): ActivityEntry {
  return {
    id: createId(),
    message,
    user,
    createdAt: new Date().toISOString(),
  };
}

function appendActivity(product: Product, message: string, user: string) {
  return [buildActivityEntry(message, user), ...product.activity].slice(0, 25);
}

function getProductSortDate(product: Product, dropDays: DropDay[]) {
  const primaryMilestone = getProductPrimaryMilestone(product, dropDays);
  return primaryMilestone.date ?? product.updatedAt.slice(0, 10);
}

function getStatusBadgeClasses(status: ProductStatus) {
  switch (status) {
    case "idea":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "sample":
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    case "bulk":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "launched":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "canceled":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

function getCalendarEventClasses(type: CalendarItemType) {
  switch (type) {
    case "sample":
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    case "drop":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    case "bulk":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "arrival":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "drop-day":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "custom":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-white text-slate-700";
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

function buildProductImagePath(productId: string, fileName: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop() ?? "jpg" : "jpg";
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${productId}/${Date.now()}-${baseName || "product-image"}.${extension.toLowerCase()}`;
}

function isStoredProductImagePath(imagePath: string | null | undefined) {
  return Boolean(
    imagePath &&
      !imagePath.startsWith("data:") &&
      !imagePath.startsWith("http://") &&
      !imagePath.startsWith("https://"),
  );
}

export function PipelineApp() {
  const authMode: AuthMode = isSupabaseConfigured() ? "supabase" : "demo";
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [view, setView] = useState<View>("dashboard");
  const [productLayout, setProductLayout] = useState<ProductLayout>("list");
  const [scope, setScope] = useState<Scope>("all");
  const [data, setData] = useState<AppData>(createEmptyAppData());
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const [dropDraft, setDropDraft] = useState<DropDayDraft>(emptyDropDayDraft);
  const [costDraft, setCostDraft] = useState<CostEntryDraft>(emptyCostDraft);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productEditor, setProductEditor] = useState<Product | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(authMode === "demo");
  const [activeUserEmail, setActiveUserEmail] = useState<string>("Demo mode");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showProductDrawer, setShowProductDrawer] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showAddDropModal, setShowAddDropModal] = useState(false);
  const [editingDropDayId, setEditingDropDayId] = useState<string | null>(null);
  const [showCalendarEventModal, setShowCalendarEventModal] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productStatusFilter, setProductStatusFilter] =
    useState<ProductStatusFilter>("all");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productSort, setProductSort] = useState<ProductSort>("next-action");
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
      return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
    } catch {
      return [];
    }
  });
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [costEditor, setCostEditor] = useState<CostEditorState>({
    id: null,
    draft: emptyCostDraft,
  });
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "agenda">("month");
  const [showArchivedDrops, setShowArchivedDrops] = useState(false);
  const [calendarEventDraft, setCalendarEventDraft] =
    useState<CalendarEventDraft>(emptyCalendarEventDraft);

  const productsWithCosts = useMemo(
    () => attachCosts(data.products, data.costEntries),
    [data.products, data.costEntries],
  );

  const filteredProducts = useMemo(() => {
    if (scope === "all") {
      return productsWithCosts;
    }

    return productsWithCosts.filter((product) => product.dropDayId === scope);
  }, [productsWithCosts, scope]);

  const visibleDropDays = useMemo(
    () => data.dropDays.filter((dropDay) => (showArchivedDrops ? true : !dropDay.archived)),
    [data.dropDays, showArchivedDrops],
  );

  const productCategories = useMemo(() => {
    return Array.from(
      new Set(
        productsWithCosts
          .map((product) => product.category)
          .filter((category) => category.trim().length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }, [productsWithCosts]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase();

    const nextProducts = filteredProducts
      .filter((product) =>
        productStatusFilter === "all" ? true : product.status === productStatusFilter,
      )
      .filter((product) =>
        productCategoryFilter === "all" ? true : product.category === productCategoryFilter,
      )
      .filter((product) => {
        if (!normalizedSearch) {
          return true;
        }

        const searchText = [
          product.name,
          product.sku,
          product.category,
          product.supplier,
          getDropDayName(data.dropDays, product.dropDayId),
        ]
          .join(" ")
          .toLowerCase();

        return searchText.includes(normalizedSearch);
      });

    return [...nextProducts].sort((left, right) => {
      switch (productSort) {
        case "name":
          return left.name.localeCompare(right.name);
        case "cost-high":
          return getProductTotalCost(right) - getProductTotalCost(left);
        case "newest":
          return right.createdAt.localeCompare(left.createdAt);
        case "next-action":
        default:
          return getProductSortDate(left, data.dropDays).localeCompare(
            getProductSortDate(right, data.dropDays),
          );
      }
    });
  }, [
    data.dropDays,
    filteredProducts,
    productCategoryFilter,
    productSearch,
    productSort,
    productStatusFilter,
  ]);

  const dashboardAgenda = useMemo(() => {
    return filteredProducts
      .flatMap((product) => {
        const dropDate = getAssignedDropDate(data.dropDays, product.dropDayId);
        if (!dropDate || product.status === "canceled" || product.status === "launched") {
          return [];
        }

        const items: PlanningAgendaItem[] = [];
        const bulkStartBy =
          product.productionDays > 0 || product.shippingDays > 0
            ? format(
                subBusinessDays(
                  parseISO(dropDate),
                  Math.max(product.productionDays, 0) + Math.max(product.shippingDays, 0),
                ),
                "yyyy-MM-dd",
              )
            : null;

        const sampleApproveBy = bulkStartBy
          ? format(
              subBusinessDays(parseISO(bulkStartBy), SAMPLE_REVIEW_BUFFER_DAYS),
              "yyyy-MM-dd",
            )
          : null;

        const sampleOrderBy =
          sampleApproveBy && (product.sampleProductionDays > 0 || product.sampleShippingDays > 0)
            ? format(
                subBusinessDays(
                  parseISO(sampleApproveBy),
                  Math.max(product.sampleProductionDays, 0) +
                    Math.max(product.sampleShippingDays, 0),
                ),
                "yyyy-MM-dd",
              )
            : null;

        if (
          (product.status === "idea" || product.status === "sample") &&
          !product.sampleOrderedAt &&
          sampleOrderBy
        ) {
          items.push({
            id: `${product.id}-sample-order-by`,
            productId: product.id,
            title: `Order sample by ${formatDate(sampleOrderBy)}`,
            detail: `${product.name} should enter sampling in time for ${getDropDayName(data.dropDays, product.dropDayId)}.`,
            date: sampleOrderBy,
            status:
              (daysUntil(sampleOrderBy) ?? 99) < 0
                ? "late"
                : (daysUntil(sampleOrderBy) ?? 99) <= 7
                  ? "soon"
                  : "planned",
          });
        }

        if (
          product.status === "sample" &&
          product.sampleOrderedAt &&
          !product.bulkStartDate &&
          sampleApproveBy
        ) {
          items.push({
            id: `${product.id}-sample-approve-by`,
            productId: product.id,
            title: `Approve sample by ${formatDate(sampleApproveBy)}`,
            detail: `${product.name} needs approval so bulk can start by ${formatDate(bulkStartBy)}.`,
            date: sampleApproveBy,
            status:
              (daysUntil(sampleApproveBy) ?? 99) < 0
                ? "late"
                : (daysUntil(sampleApproveBy) ?? 99) <= 7
                  ? "soon"
                  : "planned",
          });
        }

        if (product.status === "bulk" && !product.bulkStartDate && bulkStartBy) {
          items.push({
            id: `${product.id}-bulk-start-by`,
            productId: product.id,
            title: `Bulk should start by ${formatDate(bulkStartBy)}`,
            detail: `${product.name} needs bulk started in time to hit ${formatDate(dropDate)}.`,
            date: bulkStartBy,
            status:
              (daysUntil(bulkStartBy) ?? 99) < 0
                ? "late"
                : (daysUntil(bulkStartBy) ?? 99) <= 7
                  ? "soon"
                  : "planned",
          });
        }

        return items;
      })
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 10);
  }, [data.dropDays, filteredProducts]);

  const selectedProduct = useMemo(
    () =>
      productsWithCosts.find((product) => product.id === selectedProductId) ??
      visibleProducts[0] ??
      null,
    [productsWithCosts, selectedProductId, visibleProducts],
  );

  useEffect(() => {
    void initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(savedFilters));
  }, [savedFilters]);

  function syncSelection(nextData: AppData, preferredProductId?: string | null) {
    const nextSelectedProduct =
      nextData.products.find((product) => product.id === preferredProductId) ??
      nextData.products[0] ??
      null;

    setSelectedProductId(nextSelectedProduct?.id ?? null);
    setProductEditor(nextSelectedProduct);
  }

  function openProduct(product: ProductWithCosts) {
    setSelectedProductId(product.id);
    setProductEditor(product);
    setShowProductDrawer(true);
    setDrawerTab("overview");
    cancelEditingCost();
  }

  function resetProductFilters() {
    setProductSearch("");
    setProductStatusFilter("all");
    setProductCategoryFilter("all");
    setProductSort("next-action");
  }

  function saveCurrentFilter() {
    const name = window.prompt("Name this filter view");
    if (!name?.trim()) {
      return;
    }

    const nextFilter: SavedFilter = {
      id: createId(),
      name: name.trim(),
      search: productSearch,
      status: productStatusFilter,
      category: productCategoryFilter,
      sort: productSort,
    };

    setSavedFilters((current) => [nextFilter, ...current.filter((item) => item.name !== nextFilter.name)].slice(0, 8));
    setMessage(`Saved filter "${nextFilter.name}".`);
  }

  function applySavedFilter(filter: SavedFilter) {
    setProductSearch(filter.search);
    setProductStatusFilter(filter.status);
    setProductCategoryFilter(filter.category);
    setProductSort(filter.sort);
  }

  function openProductsShortcut(options: {
    status?: ProductStatusFilter;
    sort?: ProductSort;
    search?: string;
  }) {
    setProductSearch(options.search ?? "");
    setProductStatusFilter(options.status ?? "all");
    setProductCategoryFilter("all");
    setProductSort(options.sort ?? "next-action");
    setView("products");
    setProductLayout("list");
  }

  async function saveDropDayRecord(updatedDropDay: DropDay) {
    if (authMode === "demo") {
      const nextData = {
        ...data,
        dropDays: data.dropDays
          .map((item) => (item.id === updatedDropDay.id ? updatedDropDay : item))
          .sort((left, right) => left.targetDate.localeCompare(right.targetDate)),
      };
      await persistData(nextData, selectedProductId);
      return null;
    }

    if (!supabase) {
      return "Supabase is not configured correctly.";
    }

    const { error: updateError } = await supabase
      .from("drop_days")
      .update({
        name: updatedDropDay.name,
        target_date: updatedDropDay.targetDate,
        description: serializeDropDescription(updatedDropDay),
      })
      .eq("id", updatedDropDay.id);

    if (updateError) {
      return updateError.message;
    }

    await refreshSupabaseData();
    return null;
  }

  async function toggleDropArchive(dropDayId: string, archived: boolean) {
    const dropDay = data.dropDays.find((item) => item.id === dropDayId);
    if (!dropDay) {
      return;
    }

    const nextDropDay = { ...dropDay, archived };

    const saveError = await saveDropDayRecord(nextDropDay);
    if (saveError) {
      setError(saveError);
      return;
    }
    setMessage(archived ? "Drop archived." : "Drop restored.");
  }

  async function initializeApp() {
    setLoading(true);
    setError("");

    if (authMode === "demo") {
      const localData = loadLocalData();
      setData(localData);
      syncSelection(localData);
      setLoading(false);
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured correctly.");
      setLoading(false);
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      return;
    }

    if (!session) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);
    setActiveUserEmail(session.user.email ?? "Signed in");
    await refreshSupabaseData();
    setLoading(false);
  }

  async function refreshSupabaseData() {
    if (!supabase) {
      return;
    }

    const [dropResponse, productResponse, costResponse] = await Promise.all([
      supabase.from("drop_days").select("*").order("target_date", { ascending: true }),
      supabase.from("products").select("*").order("updated_at", { ascending: false }),
      supabase.from("cost_entries").select("*").order("entry_date", { ascending: false }),
    ]);

    if (dropResponse.error || productResponse.error || costResponse.error) {
      setError(
        dropResponse.error?.message ??
          productResponse.error?.message ??
          costResponse.error?.message ??
          "Unable to load data.",
      );
      return;
    }

    const nextData = {
      dropDays: (dropResponse.data as DropDayRow[]).map(mapDropDayRow),
      products: (productResponse.data as ProductRow[]).map(mapProductRow),
      costEntries: (costResponse.data as CostEntryRow[]).map(mapCostRow),
    };

    setData(nextData);
    syncSelection(nextData, selectedProductId);
  }

  async function persistData(nextData: AppData, preferredProductId?: string | null) {
    setData(nextData);
    saveLocalData(nextData);
    syncSelection(nextData, preferredProductId);
  }

  async function handleLogin(mode: "sign-in" | "sign-up") {
    if (!supabase) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const response =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (response.error) {
      setError(response.error.message);
      setSaving(false);
      return;
    }

    if (mode === "sign-up") {
      setMessage("Account created. If email confirmation is enabled, confirm it and sign in.");
      setSaving(false);
      return;
    }

    setActiveUserEmail(response.data.user?.email ?? email);
    setIsAuthenticated(true);
    await refreshSupabaseData();
    setSaving(false);
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setData(createEmptyAppData());
    setMessage("");
    setError("");
  }

  async function handleAddDropDay() {
    if (!dropDraft.name || !dropDraft.targetDate) {
      setError("Drop day name and target date are required.");
      return;
    }

    setSaving(true);
    setError("");

    const newDropDay: DropDay = {
      id: createId(),
      name: dropDraft.name,
      targetDate: dropDraft.targetDate,
      description: dropDraft.description,
      archived: false,
      customEvents: [],
      createdAt: new Date().toISOString(),
    };

    if (authMode === "demo") {
      await persistData(
        {
          ...data,
          dropDays: [...data.dropDays, newDropDay].sort((left, right) =>
            left.targetDate.localeCompare(right.targetDate),
          ),
        },
        selectedProductId,
      );
      setDropDraft(emptyDropDayDraft);
      setShowAddDropModal(false);
      setSaving(false);
      setMessage("Drop day added.");
      return;
    }

    if (!supabase) {
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("drop_days").insert({
      id: newDropDay.id,
      name: newDropDay.name,
      target_date: newDropDay.targetDate,
      description: serializeDropDescription(newDropDay),
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await refreshSupabaseData();
    setDropDraft(emptyDropDayDraft);
    setShowAddDropModal(false);
    setSaving(false);
    setMessage("Drop day added.");
  }

  function openNewDropDayModal() {
    setEditingDropDayId(null);
    setDropDraft(emptyDropDayDraft);
    setShowAddDropModal(true);
  }

  function openEditDropDayModal(dropDay: DropDay) {
    setEditingDropDayId(dropDay.id);
    setDropDraft({
      name: dropDay.name,
      targetDate: dropDay.targetDate,
      description: dropDay.description,
    });
    setShowAddDropModal(true);
  }

  function closeDropDayModal() {
    setEditingDropDayId(null);
    setDropDraft(emptyDropDayDraft);
    setShowAddDropModal(false);
  }

  async function handleSaveDropDay() {
    if (!dropDraft.name || !dropDraft.targetDate) {
      setError("Drop day name and target date are required.");
      return;
    }

    if (!editingDropDayId) {
      await handleAddDropDay();
      return;
    }

    const existingDropDay = data.dropDays.find((item) => item.id === editingDropDayId);
    if (!existingDropDay) {
      setError("Could not find that drop day.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const saveError = await saveDropDayRecord({
      ...existingDropDay,
      name: dropDraft.name,
      targetDate: dropDraft.targetDate,
      description: dropDraft.description,
    });

    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    closeDropDayModal();
    setSaving(false);
    setMessage("Drop day updated.");
  }

  async function handleAddProduct() {
    if (!productDraft.name || !productDraft.category) {
      setError("Product name and category are required.");
      return;
    }

    setSaving(true);
    setError("");

    const newProduct: Product = {
      id: createId(),
      ...productDraft,
      targetLaunchDate: getAssignedDropDate(data.dropDays, productDraft.dropDayId),
      activity: [buildActivityEntry("Product created", activeUserEmail)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (authMode === "demo") {
      const nextData = {
        ...data,
        products: [newProduct, ...data.products],
      };
      await persistData(nextData, newProduct.id);
      setProductDraft(emptyProductDraft);
      setShowAddProductModal(false);
      setShowProductDrawer(true);
      setSaving(false);
      setMessage("Product added.");
      return;
    }

    if (!supabase) {
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("products").insert({
      id: newProduct.id,
      ...toProductRow(newProduct),
      created_at: newProduct.createdAt,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await refreshSupabaseData();
    setSelectedProductId(newProduct.id);
    setProductDraft(emptyProductDraft);
    setShowAddProductModal(false);
    setShowProductDrawer(true);
    setSaving(false);
    setMessage("Product added.");
  }

  async function saveProductRecord(updatedProduct: Product) {
    if (authMode === "demo") {
      await persistData(
        {
          ...data,
          products: data.products.map((product) =>
            product.id === updatedProduct.id ? updatedProduct : product,
          ),
        },
        updatedProduct.id,
      );
      return null;
    }

    if (!supabase) {
      return "Supabase is not configured correctly.";
    }

    const { error: updateError } = await supabase
      .from("products")
      .update(toProductRow(updatedProduct))
      .eq("id", updatedProduct.id);

    if (updateError) {
      return updateError.message;
    }

    await refreshSupabaseData();
    return null;
  }

  async function handleSaveProduct() {
    if (!productEditor) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    const updatedProduct = {
      ...productEditor,
      targetLaunchDate: getAssignedDropDate(data.dropDays, productEditor.dropDayId),
      activity: appendActivity(productEditor, "Product details updated", activeUserEmail),
      updatedAt: new Date().toISOString(),
    };

    const saveError = await saveProductRecord(updatedProduct);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    setSaving(false);
    setMessage("Product updated.");
  }

  async function handleProductImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !productEditor) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose an image under 5 MB.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    if (authMode === "demo") {
      try {
        const imagePath = await readFileAsDataUrl(file);
        const updatedProduct = {
          ...productEditor,
          imagePath,
          updatedAt: new Date().toISOString(),
        };

        setProductEditor(updatedProduct);
        const saveError = await saveProductRecord(updatedProduct);
        if (saveError) {
          setError(saveError);
          setSaving(false);
          return;
        }

        setSaving(false);
        setMessage("Product image uploaded.");
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : "Unable to upload the image.",
        );
        setSaving(false);
      }
      return;
    }

    if (!supabase) {
      setError("Supabase is not configured correctly.");
      setSaving(false);
      return;
    }

    const oldImagePath = productEditor.imagePath;
    const nextImagePath = buildProductImagePath(productEditor.id, file.name);

    const { error: uploadError } = await supabase.storage
      .from(productImagesBucket)
      .upload(nextImagePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
      return;
    }

    const updatedProduct = {
      ...productEditor,
      imagePath: nextImagePath,
      updatedAt: new Date().toISOString(),
    };

    setProductEditor(updatedProduct);
    const saveError = await saveProductRecord(updatedProduct);
    if (saveError) {
      await supabase.storage.from(productImagesBucket).remove([nextImagePath]);
      setError(saveError);
      setSaving(false);
      return;
    }

    if (oldImagePath && isStoredProductImagePath(oldImagePath) && oldImagePath !== nextImagePath) {
      await supabase.storage.from(productImagesBucket).remove([oldImagePath]);
    }

    setSaving(false);
    setMessage("Product image uploaded.");
  }

  async function handleRemoveProductImage() {
    if (!productEditor?.imagePath) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const oldImagePath = productEditor.imagePath;
    const updatedProduct = {
      ...productEditor,
      imagePath: null,
      updatedAt: new Date().toISOString(),
    };

    setProductEditor(updatedProduct);
    const saveError = await saveProductRecord(updatedProduct);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    if (authMode === "supabase" && supabase && oldImagePath && isStoredProductImagePath(oldImagePath)) {
      await supabase.storage.from(productImagesBucket).remove([oldImagePath]);
    }

    setSaving(false);
    setMessage("Product image removed.");
  }

  async function handleQuickStatusUpdate(productId: string, status: ProductStatus) {
    const product = data.products.find((item) => item.id === productId);
    if (!product) {
      return;
    }

    const nextProduct = {
      ...product,
      status,
      activity: appendActivity(
        product,
        `Status changed to ${getStatusLabel(status)}`,
        activeUserEmail,
      ),
      updatedAt: new Date().toISOString(),
    };

    if (authMode === "demo") {
      await persistData(
        {
          ...data,
          products: data.products.map((item) => (item.id === productId ? nextProduct : item)),
        },
        selectedProductId ?? productId,
      );
      return;
    }

    if (!supabase) {
      return;
    }

    const { error: updateError } = await supabase
      .from("products")
      .update(toProductRow(nextProduct))
      .eq("id", productId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await refreshSupabaseData();
  }

  function openNewCalendarEvent() {
    setCalendarEventDraft({
      ...emptyCalendarEventDraft,
      dropDayId: scope === "all" ? data.dropDays[0]?.id ?? "" : scope,
    });
    setShowCalendarEventModal(true);
  }

  function openCalendarEventEditor(item: CalendarItem) {
    if (item.kind !== "custom-event" || !item.dropDayId) {
      return;
    }

    setCalendarEventDraft({
      id: item.id,
      dropDayId: item.dropDayId,
      title: item.label,
      notes: item.notes ?? "",
      date: item.date,
    });
    setShowCalendarEventModal(true);
  }

  async function handleSaveCalendarEvent() {
    if (!calendarEventDraft.dropDayId || !calendarEventDraft.title.trim() || !calendarEventDraft.date) {
      setError("Drop day, event title, and date are required.");
      return;
    }

    const dropDay = data.dropDays.find((item) => item.id === calendarEventDraft.dropDayId);
    if (!dropDay) {
      setError("Choose a valid drop day for this event.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const nextEvent: CalendarNoteEvent = {
      id: calendarEventDraft.id ?? createId(),
      title: calendarEventDraft.title.trim(),
      notes: calendarEventDraft.notes.trim(),
      date: calendarEventDraft.date,
    };

    const previousDropDay =
      calendarEventDraft.id
        ? data.dropDays.find((item) =>
            item.customEvents.some((event) => event.id === calendarEventDraft.id),
          )
        : null;

    if (previousDropDay && previousDropDay.id !== dropDay.id) {
      const previousSaveError = await saveDropDayRecord({
        ...previousDropDay,
        customEvents: previousDropDay.customEvents.filter((item) => item.id !== nextEvent.id),
      });

      if (previousSaveError) {
        setError(previousSaveError);
        setSaving(false);
        return;
      }
    }

    const nextDropDay: DropDay = {
      ...dropDay,
      customEvents: [
        ...dropDay.customEvents.filter((item) => item.id !== nextEvent.id),
        nextEvent,
      ].sort((left, right) => left.date.localeCompare(right.date)),
    };

    const saveError = await saveDropDayRecord(nextDropDay);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    setShowCalendarEventModal(false);
    setCalendarEventDraft(emptyCalendarEventDraft);
    setSaving(false);
    setMessage(calendarEventDraft.id ? "Calendar event updated." : "Calendar event added.");
  }

  async function handleDeleteCalendarEvent() {
    if (!calendarEventDraft.id || !calendarEventDraft.dropDayId) {
      return;
    }

    const dropDay = data.dropDays.find((item) => item.id === calendarEventDraft.dropDayId);
    if (!dropDay) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const nextDropDay: DropDay = {
      ...dropDay,
      customEvents: dropDay.customEvents.filter((item) => item.id !== calendarEventDraft.id),
    };

    const saveError = await saveDropDayRecord(nextDropDay);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    setShowCalendarEventModal(false);
    setCalendarEventDraft(emptyCalendarEventDraft);
    setSaving(false);
    setMessage("Calendar event deleted.");
  }

  async function handleCalendarEventOpen(item: CalendarItem) {
    if (!item.productId) {
      if (item.kind === "custom-event") {
        openCalendarEventEditor(item);
        return;
      }

      if (item.kind === "drop-day") {
        const dropDayId = item.id.replace(/-drop-day$/, "");
        setScope(dropDayId);
        setView("products");
      }
      return;
    }

    const product = productsWithCosts.find((entry) => entry.id === item.productId);
    if (!product) {
      return;
    }

    openProduct(product);
  }

  async function handleCalendarEventDrop(item: CalendarItem, targetDate: string) {
    if (!item.draggable) {
      return;
    }

    if (item.kind === "custom-event" && item.dropDayId) {
      const dropDay = data.dropDays.find((entry) => entry.id === item.dropDayId);
      if (!dropDay) {
        return;
      }

      const customEvent = dropDay.customEvents.find((entry) => entry.id === item.id);
      if (!customEvent) {
        return;
      }

      setSaving(true);
      setError("");
      setMessage("");

      const saveError = await saveDropDayRecord({
        ...dropDay,
        customEvents: dropDay.customEvents
          .map((entry) => (entry.id === item.id ? { ...entry, date: targetDate } : entry))
          .sort((left, right) => left.date.localeCompare(right.date)),
      });

      if (saveError) {
        setError(saveError);
        setSaving(false);
        return;
      }

      if (calendarEventDraft.id === item.id) {
        setCalendarEventDraft((current) => ({ ...current, date: targetDate }));
      }

      setSaving(false);
      setMessage(`${customEvent.title} moved to ${formatDate(targetDate)}.`);
      return;
    }

    if (item.kind === "drop-day" && item.dropDayId) {
      const dropDay = data.dropDays.find((entry) => entry.id === item.dropDayId);
      if (!dropDay) {
        return;
      }

      setSaving(true);
      setError("");
      setMessage("");

      const saveError = await saveDropDayRecord({
        ...dropDay,
        targetDate,
      });

      if (saveError) {
        setError(saveError);
        setSaving(false);
        return;
      }

      setSaving(false);
      setMessage(`${dropDay.name} moved to ${formatDate(targetDate)}.`);
      return;
    }

    if (!item.productId) {
      return;
    }

    const product = data.products.find((entry) => entry.id === item.productId);
    if (!product) {
      return;
    }

    const totalBusinessDays =
      item.kind === "sample-arrival"
        ? product.sampleProductionDays + product.sampleShippingDays
        : item.kind === "bulk-ready"
          ? product.productionDays
          : item.kind === "arrival"
            ? product.productionDays + product.shippingDays
            : 0;

    const shiftedDate =
      totalBusinessDays > 0
        ? format(subBusinessDays(parseISO(targetDate), totalBusinessDays), "yyyy-MM-dd")
        : targetDate;

    const updatedProduct: Product = {
      ...product,
      targetLaunchDate: getAssignedDropDate(data.dropDays, product.dropDayId),
      sampleOrderedAt:
        item.kind === "sample-arrival" ? shiftedDate : product.sampleOrderedAt,
      bulkStartDate:
        item.kind === "bulk-ready" || item.kind === "arrival"
          ? shiftedDate
          : product.bulkStartDate,
      activity: appendActivity(
        product,
        `${item.label} moved to ${formatDate(targetDate)}`,
        activeUserEmail,
      ),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    setError("");
    setMessage("");

    const saveError = await saveProductRecord(updatedProduct);
    if (saveError) {
      setError(saveError);
      setSaving(false);
      return;
    }

    if (selectedProductId === updatedProduct.id) {
      setProductEditor(updatedProduct);
    }

    setSaving(false);
    setMessage(`${product.name} moved to ${formatDate(targetDate)}.`);
  }

  async function handleAddCostEntry() {
    if (!selectedProductId) {
      setError("Pick a product before adding a cost entry.");
      return;
    }

    if (!costDraft.title || costDraft.amount <= 0) {
      setError("Cost title and amount are required.");
      return;
    }

    setSaving(true);
    setError("");

    const newEntry: CostEntry = {
      id: createId(),
      productId: selectedProductId,
      title: costDraft.title,
      description: costDraft.description,
      amount: costDraft.amount,
      entryDate: costDraft.entryDate,
      costType: costDraft.costType,
      createdAt: new Date().toISOString(),
    };

    if (authMode === "demo") {
      const selectedProductRecord = data.products.find((product) => product.id === selectedProductId);
      await persistData(
        {
          ...data,
          products: data.products.map((product) =>
            product.id === selectedProductId && selectedProductRecord
              ? {
                  ...selectedProductRecord,
                  activity: appendActivity(
                    selectedProductRecord,
                    `Cost added: ${newEntry.title} (${currency(newEntry.amount)})`,
                    activeUserEmail,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : product,
          ),
          costEntries: [newEntry, ...data.costEntries],
        },
        selectedProductId,
      );
      setCostDraft(emptyCostDraft);
      setSaving(false);
      setMessage("Cost entry added.");
      return;
    }

    if (!supabase) {
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("cost_entries").insert({
      id: newEntry.id,
      product_id: newEntry.productId,
      title: newEntry.title,
      description: newEntry.description,
      amount: newEntry.amount,
      entry_date: newEntry.entryDate,
      cost_type: newEntry.costType,
      created_at: newEntry.createdAt,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    const selectedProductRecord = data.products.find((product) => product.id === selectedProductId);
    if (selectedProductRecord) {
      await saveProductRecord({
        ...selectedProductRecord,
        activity: appendActivity(
          selectedProductRecord,
          `Cost added: ${newEntry.title} (${currency(newEntry.amount)})`,
          activeUserEmail,
        ),
        updatedAt: new Date().toISOString(),
      });
    }

    await refreshSupabaseData();
    setCostDraft(emptyCostDraft);
    setSaving(false);
    setMessage("Cost entry added.");
  }

  function startEditingCost(entry: CostEntry) {
    setCostEditor({
      id: entry.id,
      draft: {
        title: entry.title,
        description: entry.description,
        amount: entry.amount,
        entryDate: entry.entryDate,
        costType: entry.costType,
      },
    });
    setDrawerTab("costs");
  }

  function cancelEditingCost() {
    setCostEditor({
      id: null,
      draft: emptyCostDraft,
    });
  }

  async function handleSaveEditedCost() {
    if (!costEditor.id || !selectedProductId) {
      return;
    }

    if (!costEditor.draft.title || costEditor.draft.amount <= 0) {
      setError("Cost title and amount are required.");
      return;
    }

    setSaving(true);
    setError("");

    const nextEntry: CostEntry = {
      id: costEditor.id,
      productId: selectedProductId,
      title: costEditor.draft.title,
      description: costEditor.draft.description,
      amount: costEditor.draft.amount,
      entryDate: costEditor.draft.entryDate,
      costType: costEditor.draft.costType,
      createdAt:
        data.costEntries.find((entry) => entry.id === costEditor.id)?.createdAt ??
        new Date().toISOString(),
    };

    if (authMode === "demo") {
      const selectedProductRecord = data.products.find((product) => product.id === selectedProductId);
      await persistData(
        {
          ...data,
          products: data.products.map((product) =>
            product.id === selectedProductId && selectedProductRecord
              ? {
                  ...selectedProductRecord,
                  activity: appendActivity(
                    selectedProductRecord,
                    `Cost updated: ${nextEntry.title}`,
                    activeUserEmail,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : product,
          ),
          costEntries: data.costEntries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry)),
        },
        selectedProductId,
      );
      cancelEditingCost();
      setSaving(false);
      setMessage("Cost entry updated.");
      return;
    }

    if (!supabase) {
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("cost_entries")
      .update({
        title: nextEntry.title,
        description: nextEntry.description,
        amount: nextEntry.amount,
        entry_date: nextEntry.entryDate,
        cost_type: nextEntry.costType,
      })
      .eq("id", nextEntry.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const selectedProductRecord = data.products.find((product) => product.id === selectedProductId);
    if (selectedProductRecord) {
      await saveProductRecord({
        ...selectedProductRecord,
        activity: appendActivity(selectedProductRecord, `Cost updated: ${nextEntry.title}`, activeUserEmail),
        updatedAt: new Date().toISOString(),
      });
    }

    cancelEditingCost();
    setSaving(false);
    setMessage("Cost entry updated.");
  }

  async function handleDeleteCostEntry(entryId: string) {
    const entry = data.costEntries.find((item) => item.id === entryId);
    if (!entry) {
      return;
    }

    setSaving(true);
    setError("");

    if (authMode === "demo") {
      const selectedProductRecord = data.products.find((product) => product.id === entry.productId);
      await persistData(
        {
          ...data,
          products: data.products.map((product) =>
            product.id === entry.productId && selectedProductRecord
              ? {
                  ...selectedProductRecord,
                  activity: appendActivity(
                    selectedProductRecord,
                    `Cost deleted: ${entry.title}`,
                    activeUserEmail,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : product,
          ),
          costEntries: data.costEntries.filter((item) => item.id !== entryId),
        },
        entry.productId,
      );
      if (costEditor.id === entryId) {
        cancelEditingCost();
      }
      setSaving(false);
      setMessage("Cost entry deleted.");
      return;
    }

    if (!supabase) {
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase.from("cost_entries").delete().eq("id", entryId);
    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    const selectedProductRecord = data.products.find((product) => product.id === entry.productId);
    if (selectedProductRecord) {
      await saveProductRecord({
        ...selectedProductRecord,
        activity: appendActivity(selectedProductRecord, `Cost deleted: ${entry.title}`, activeUserEmail),
        updatedAt: new Date().toISOString(),
      });
    }

    if (costEditor.id === entryId) {
      cancelEditingCost();
    }

    await refreshSupabaseData();
    setSaving(false);
    setMessage("Cost entry deleted.");
  }

  const calendarItems = useMemo(() => {
    const productItems: CalendarItem[] = filteredProducts.flatMap((product) => {
      const timeline = getProductTimeline(product);
      const items: CalendarItem[] = [];

      if (timeline.sampleArrivalDate) {
        items.push({
          id: `${product.id}-sample-arrival`,
          date: timeline.sampleArrivalDate,
          label: `${product.name} sample arrival`,
          type: "sample",
          kind: "sample-arrival",
          productId: product.id,
          draggable: true,
          dropDayId: product.dropDayId,
        });
      }

      if (timeline.bulkReadyDate) {
        items.push({
          id: `${product.id}-bulk`,
          date: timeline.bulkReadyDate,
          label: `${product.name} bulk ready`,
          type: "bulk",
          kind: "bulk-ready",
          productId: product.id,
          draggable: true,
          dropDayId: product.dropDayId,
        });
      }

      if (timeline.arrivalDate) {
        items.push({
          id: `${product.id}-arrival`,
          date: timeline.arrivalDate,
          label: `${product.name} arrival`,
          type: "arrival",
          kind: "arrival",
          productId: product.id,
          draggable: true,
          dropDayId: product.dropDayId,
        });
      }

      return items;
    });

    const dropItems: CalendarItem[] = visibleDropDays
      .filter((dropDay) => scope === "all" || dropDay.id === scope)
      .map((dropDay) => ({
        id: `${dropDay.id}-drop-day`,
        date: dropDay.targetDate,
        label: `${dropDay.name}`,
        type: "drop-day" as const,
        kind: "drop-day" as const,
        productId: null,
        draggable: true,
        dropDayId: dropDay.id,
      }));

    const customEventItems: CalendarItem[] = visibleDropDays
      .filter((dropDay) => scope === "all" || dropDay.id === scope)
      .flatMap((dropDay) =>
        dropDay.customEvents.map((event) => ({
          id: event.id,
          date: event.date,
          label: event.title,
          type: "custom" as const,
          kind: "custom-event" as const,
          productId: null,
          draggable: true,
          dropDayId: dropDay.id,
          notes: event.notes,
        })),
      );

    return [...productItems, ...dropItems, ...customEventItems].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
  }, [filteredProducts, scope, visibleDropDays]);

  const dashboardCalendarAgenda = useMemo(() => {
    const upcomingItems = calendarItems.filter((item) => (daysUntil(item.date) ?? 999) >= 0);
    return (upcomingItems.length ? upcomingItems : calendarItems).slice(0, 8);
  }, [calendarItems]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 text-slate-900">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          Loading your product pipeline...
        </div>
      </div>
    );
  }

  if (authMode === "supabase" && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-100 px-4 py-12 text-slate-900">
        <div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 space-y-3">
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Private internal app
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Order Buddy</h1>
            <p className="text-sm text-slate-600">
              Sign in with your Supabase email and password to manage products, costs,
              and drop days with your business partner.
            </p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-600">Email</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-0 transition focus:border-emerald-400"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-600">Password</span>
              <input
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-emerald-400"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
            </label>

            {error ? (
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl bg-emerald-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void handleLogin("sign-in")}
                disabled={saving}
              >
                Sign in
              </button>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void handleLogin("sign-up")}
                disabled={saving}
              >
                Create account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 text-slate-900">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="mb-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {authMode === "demo" ? "Demo mode" : "Shared live workspace"}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {activeUserEmail}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Order Buddy</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Track golf apparel ideas, samples, production, arrival windows, and total
                product costs in one shared workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {authMode === "supabase" ? (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-medium text-slate-700">Views</p>
              <div className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition",
                        view === item.id
                          ? "bg-emerald-400 text-slate-950"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                      )}
                      onClick={() => setView(item.id)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-700">Product scope</p>
                <button
                  className="text-xs uppercase tracking-[0.16em] text-slate-500 transition hover:text-slate-900"
                  onClick={() => setShowArchivedDrops((current) => !current)}
                >
                  {showArchivedDrops ? "Hide archived" : "Show archived"}
                </button>
              </div>
              <div className="space-y-2">
                <button
                  className={cn(
                    "w-full rounded-2xl px-4 py-3 text-left text-sm transition",
                    scope === "all"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                  )}
                  onClick={() => setScope("all")}
                >
                  All products
                </button>
                {visibleDropDays.map((dropDay) => (
                  <button
                    key={dropDay.id}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left text-sm transition",
                      scope === dropDay.id
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100",
                    )}
                    onClick={() => {
                      setScope(dropDay.id);
                      setView("products");
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{dropDay.name}</div>
                      {dropDay.archived ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs opacity-80">
                      Target {formatDate(dropDay.targetDate)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="space-y-6">
            {error ? (
              <Banner tone="error" message={error} onDismiss={() => setError("")} />
            ) : null}
            {message ? (
              <Banner tone="success" message={message} onDismiss={() => setMessage("")} />
            ) : null}

            {view === "dashboard" ? (
              <DashboardView
                scopeLabel={getScopeLabel(scope, data.dropDays)}
                filteredProducts={filteredProducts}
                dashboardAgenda={dashboardAgenda}
                calendarAgendaItems={dashboardCalendarAgenda}
                onOpenStatCard={(kind) => {
                  if (kind === "ideas") {
                    openProductsShortcut({ status: "idea" });
                    return;
                  }

                  if (kind === "samples") {
                    openProductsShortcut({ status: "sample" });
                    return;
                  }

                  if (kind === "bulk") {
                    openProductsShortcut({ status: "bulk" });
                    return;
                  }

                  openProductsShortcut({ sort: "cost-high" });
                }}
                onOpenAgendaProduct={(productId) => {
                  const product = productsWithCosts.find((item) => item.id === productId);
                  if (product) {
                    openProduct(product);
                  }
                }}
                onOpenCalendarItem={(item) => {
                  void handleCalendarEventOpen(item);
                }}
              />
            ) : null}

            {view === "products" ? (
              <>
                <Card title="Products">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <p className="max-w-3xl text-sm text-slate-600">
                        Keep this page focused on finding, sorting, and acting on products. Open a
                        product only when you need to edit details, and use the filters to narrow
                        the list for new team members.
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                          <span className="font-medium text-slate-900">{visibleProducts.length}</span>{" "}
                          visible in {getScopeLabel(scope, data.dropDays)}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600">
                          <span className="font-medium text-slate-900">Workflow:</span>{" "}
                          {"Create product -> sample -> review -> bulk -> arrival"}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {selectedProduct ? (
                        <button
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          onClick={() => setShowProductDrawer(true)}
                        >
                          Open selected product
                        </button>
                      ) : null}
                      <button
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
                        onClick={() => setShowAddProductModal(true)}
                      >
                        <Plus className="h-4 w-4" />
                        New product
                      </button>
                    </div>
                  </div>
                </Card>

                <Card title="Products Workspace" className="sticky top-4 z-20">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Input
                        label="Search"
                        value={productSearch}
                        onChange={setProductSearch}
                      />
                      <Select
                        label="Status"
                        value={productStatusFilter}
                        onChange={(value) =>
                          setProductStatusFilter(value as ProductStatusFilter)
                        }
                        options={[
                          { value: "all", label: "All statuses" },
                          ...productStatuses.map((status) => ({
                            value: status,
                            label: getStatusLabel(status),
                          })),
                        ]}
                      />
                      <Select
                        label="Category"
                        value={productCategoryFilter}
                        onChange={setProductCategoryFilter}
                        options={[
                          { value: "all", label: "All categories" },
                          ...productCategories.map((category) => ({
                            value: category,
                            label: category,
                          })),
                        ]}
                      />
                      <Select
                        label="Sort by"
                        value={productSort}
                        onChange={(value) => setProductSort(value as ProductSort)}
                        options={[
                          { value: "next-action", label: "Nearest milestone" },
                          { value: "name", label: "Name" },
                          { value: "cost-high", label: "Highest cost" },
                          { value: "newest", label: "Newest first" },
                        ]}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        onClick={saveCurrentFilter}
                      >
                        Save filter
                      </button>
                      <button
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        onClick={resetProductFilters}
                      >
                        Reset
                      </button>
                      <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          className={cn(
                            "rounded-xl px-4 py-2 text-sm font-medium transition",
                            productLayout === "board"
                              ? "bg-emerald-400 text-slate-950"
                              : "text-slate-600 hover:bg-white",
                          )}
                          onClick={() => setProductLayout("board")}
                        >
                          Board
                        </button>
                        <button
                          className={cn(
                            "rounded-xl px-4 py-2 text-sm font-medium transition",
                            productLayout === "list"
                              ? "bg-emerald-400 text-slate-950"
                              : "text-slate-600 hover:bg-white",
                          )}
                          onClick={() => setProductLayout("list")}
                        >
                          List
                        </button>
                      </div>
                    </div>
                  </div>
                  {savedFilters.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {savedFilters.map((filter) => (
                        <button
                          key={filter.id}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          onClick={() => applySavedFilter(filter)}
                        >
                          {filter.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </Card>

                {productLayout === "board" ? (
                  <ProductBoard
                    products={visibleProducts}
                    dropDays={data.dropDays}
                    onSelectProduct={openProduct}
                    onMoveStatus={handleQuickStatusUpdate}
                    selectedProductId={selectedProductId}
                  />
                ) : (
                  <ProductListView
                    products={visibleProducts}
                    dropDays={data.dropDays}
                    onSelectProduct={openProduct}
                    onMoveStatus={handleQuickStatusUpdate}
                    selectedProductId={selectedProductId}
                  />
                )}
              </>
            ) : null}

            {view === "calendar" ? (
              <CalendarView
                calendarMonth={calendarMonth}
                onPrevious={() => setCalendarMonth((current) => subMonths(current, 1))}
                onNext={() => setCalendarMonth((current) => addMonths(current, 1))}
                items={calendarItems}
                mode={calendarViewMode}
                onModeChange={setCalendarViewMode}
                onAddCustomEvent={openNewCalendarEvent}
                onEventClick={(item) => void handleCalendarEventOpen(item)}
                onEventDrop={(item, targetDate) => void handleCalendarEventDrop(item, targetDate)}
              />
            ) : null}

            {view === "drops" ? (
              <>
                <Card title="Drops">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <p className="max-w-3xl text-sm text-slate-600">
                        Keep drops simple: create the date, give the release a clear name, then
                        assign products into that drop from the products page.
                      </p>
                    </div>
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
                      onClick={openNewDropDayModal}
                    >
                      <Plus className="h-4 w-4" />
                      New drop day
                    </button>
                  </div>
                </Card>

                <DropDayOverview
                  dropDays={visibleDropDays}
                  products={productsWithCosts}
                  onOpenDrop={(dropDayId) => {
                    setScope(dropDayId);
                    setView("products");
                  }}
                  onEditDrop={(dropDay) => openEditDropDayModal(dropDay)}
                  onToggleArchive={(dropDayId, archived) =>
                    void toggleDropArchive(dropDayId, archived)
                  }
                />
              </>
            ) : null}
          </main>
        </div>

        {showAddProductModal ? (
          <ModalShell
            title="Create Product"
            description="Add the basics first. You can fill in sample timing, bulk timing, costs, and images after the product exists."
            onClose={() => setShowAddProductModal(false)}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input
                label="Product name"
                value={productDraft.name}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, name: value }))
                }
              />
              <Input
                label="Category"
                value={productDraft.category}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, category: value }))
                }
              />
              <Input
                label="Supplier"
                value={productDraft.supplier}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, supplier: value }))
                }
              />
              <Select
                label="Starting status"
                value={productDraft.status}
                onChange={(value) =>
                  setProductDraft((current) => ({
                    ...current,
                    status: value as ProductStatus,
                  }))
                }
                options={productStatuses.map((status) => ({
                  value: status,
                  label: getStatusLabel(status),
                }))}
              />
              <Select
                label="Drop day"
                value={productDraft.dropDayId ?? ""}
                onChange={(value) =>
                  setProductDraft((current) => ({
                    ...current,
                    dropDayId: value || null,
                  }))
                }
                options={[
                  { value: "", label: "No drop assigned" },
                  ...data.dropDays.map((dropDay) => ({
                    value: dropDay.id,
                    label: `${dropDay.name} (${formatDate(dropDay.targetDate)})`,
                  })),
                ]}
              />
              <Input
                label="Owner"
                value={productDraft.owner}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, owner: value }))
                }
              />
              <Select
                label="Priority"
                value={productDraft.priority}
                onChange={(value) =>
                  setProductDraft((current) => ({
                    ...current,
                    priority: value as ProductPriority,
                  }))
                }
                options={productPriorityOptions}
              />
              <Input
                label="Due date"
                type="date"
                value={productDraft.dueDate ?? ""}
                onChange={(value) =>
                  setProductDraft((current) => ({
                    ...current,
                    dueDate: value || null,
                  }))
                }
              />
              <Select
                label="Next action"
                value={productDraft.workflowAction ?? ""}
                onChange={(value) =>
                  setProductDraft((current) => ({
                    ...current,
                    workflowAction: (value || null) as WorkflowAction | null,
                  }))
                }
                options={workflowActionOptions}
              />
              <Input
                label="Manual next action (overrides dropdown)"
                value={productDraft.nextAction}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, nextAction: value }))
                }
              />
              <TextArea
                label="Notes"
                value={productDraft.notes}
                onChange={(value) =>
                  setProductDraft((current) => ({ ...current, notes: value }))
                }
                className="md:col-span-2 xl:col-span-2"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => setShowAddProductModal(false)}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void handleAddProduct()}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                Create product
              </button>
            </div>
          </ModalShell>
        ) : null}

        {showAddDropModal ? (
          <ModalShell
            title={editingDropDayId ? "Edit Drop Day" : "Create Drop Day"}
            description="Use a drop when a group of products is planned for the same release window."
            onClose={closeDropDayModal}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Drop name"
                value={dropDraft.name}
                onChange={(value) =>
                  setDropDraft((current) => ({ ...current, name: value }))
                }
              />
              <Input
                label="Drop date"
                type="date"
                value={dropDraft.targetDate}
                onChange={(value) =>
                  setDropDraft((current) => ({ ...current, targetDate: value }))
                }
              />
              <TextArea
                label="Description"
                value={dropDraft.description}
                onChange={(value) =>
                  setDropDraft((current) => ({ ...current, description: value }))
                }
                className="md:col-span-2"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={closeDropDayModal}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void handleSaveDropDay()}
                disabled={saving}
              >
                <Plus className="h-4 w-4" />
                {editingDropDayId ? "Save drop day" : "Create drop day"}
              </button>
            </div>
          </ModalShell>
        ) : null}

        {showCalendarEventModal ? (
          <ModalShell
            title={calendarEventDraft.id ? "Edit Calendar Event" : "Add Calendar Event"}
            description="Track custom schedule items like photoshoots, launch prep, approvals, or team deadlines alongside your product milestones."
            onClose={() => {
              setShowCalendarEventModal(false);
              setCalendarEventDraft(emptyCalendarEventDraft);
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Drop day"
                value={calendarEventDraft.dropDayId}
                onChange={(value) =>
                  setCalendarEventDraft((current) => ({ ...current, dropDayId: value }))
                }
                options={[
                  { value: "", label: "Choose a drop day" },
                  ...data.dropDays.map((dropDay) => ({
                    value: dropDay.id,
                    label: dropDay.name,
                  })),
                ]}
              />
              <Input
                label="Date"
                type="date"
                value={calendarEventDraft.date}
                onChange={(value) =>
                  setCalendarEventDraft((current) => ({ ...current, date: value }))
                }
              />
              <Input
                label="Event title"
                value={calendarEventDraft.title}
                onChange={(value) =>
                  setCalendarEventDraft((current) => ({ ...current, title: value }))
                }
              />
              <div />
              <TextArea
                label="Notes"
                value={calendarEventDraft.notes}
                onChange={(value) =>
                  setCalendarEventDraft((current) => ({ ...current, notes: value }))
                }
                className="md:col-span-2"
              />
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <div>
                {calendarEventDraft.id ? (
                  <button
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={() => void handleDeleteCalendarEvent()}
                    disabled={saving}
                  >
                    Delete event
                  </button>
                ) : null}
              </div>
              <div className="flex gap-3">
                <button
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setShowCalendarEventModal(false);
                    setCalendarEventDraft(emptyCalendarEventDraft);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                  onClick={() => void handleSaveCalendarEvent()}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4" />
                  {calendarEventDraft.id ? "Save event" : "Add event"}
                </button>
              </div>
            </div>
          </ModalShell>
        ) : null}

        <ProductDrawer
          open={showProductDrawer && Boolean(productEditor) && Boolean(selectedProduct)}
          productEditor={productEditor}
          selectedProduct={selectedProduct}
          saving={saving}
          drawerTab={drawerTab}
          setDrawerTab={setDrawerTab}
          costDraft={costDraft}
          costEditor={costEditor}
          dropDays={data.dropDays}
          setProductEditor={setProductEditor}
          setCostDraft={setCostDraft}
          setCostEditor={setCostEditor}
          handleProductImageUpload={handleProductImageUpload}
          handleRemoveProductImage={handleRemoveProductImage}
          handleSaveProduct={handleSaveProduct}
          handleAddCostEntry={handleAddCostEntry}
          handleSaveEditedCost={handleSaveEditedCost}
          startEditingCost={startEditingCost}
          handleDeleteCostEntry={handleDeleteCostEntry}
          cancelEditingCost={cancelEditingCost}
          onClose={() => {
            setShowProductDrawer(false);
            cancelEditingCost();
          }}
        />
      </div>
    </div>
  );
}

function DashboardView({
  scopeLabel,
  filteredProducts,
  dashboardAgenda,
  calendarAgendaItems,
  onOpenStatCard,
  onOpenAgendaProduct,
  onOpenCalendarItem,
}: {
  scopeLabel: string;
  filteredProducts: ProductWithCosts[];
  dashboardAgenda: PlanningAgendaItem[];
  calendarAgendaItems: CalendarItem[];
  onOpenStatCard: (kind: "ideas" | "samples" | "bulk" | "cost") => void;
  onOpenAgendaProduct: (productId: string) => void;
  onOpenCalendarItem: (item: CalendarItem) => void;
}) {
  const totalTrackedCost = filteredProducts.reduce(
    (sum, product) => sum + getProductTotalCost(product),
    0,
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ideas"
          value={String(filteredProducts.filter((product) => product.status === "idea").length)}
          description={scopeLabel}
          icon={Layers3}
          onClick={() => onOpenStatCard("ideas")}
        />
        <StatCard
          label="Samples"
          value={String(filteredProducts.filter((product) => product.status === "sample").length)}
          description="Awaiting review or approval"
          icon={Target}
          onClick={() => onOpenStatCard("samples")}
        />
        <StatCard
          label="Bulk"
          value={String(filteredProducts.filter((product) => product.status === "bulk").length)}
          description="Approved for production"
          icon={Truck}
          onClick={() => onOpenStatCard("bulk")}
        />
        <StatCard
          label="Tracked cost"
          value={currency(totalTrackedCost)}
          description="Across selected scope"
          icon={Receipt}
          onClick={() => onOpenStatCard("cost")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Planning Agenda">
          <p className="mb-4 text-sm text-slate-400">
            Backward-plan what needs to happen next so each product can still make its assigned
            drop.
          </p>
          <div className="space-y-3">
            {dashboardAgenda.length ? (
              dashboardAgenda.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left transition hover:bg-white",
                    item.status === "late"
                      ? "border-rose-400/25 bg-rose-400/10"
                      : item.status === "soon"
                        ? "border-amber-400/25 bg-amber-400/10"
                        : "border-slate-200 bg-slate-50",
                  )}
                  onClick={() => onOpenAgendaProduct(item.productId)}
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{formatDate(item.date)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {daysUntil(item.date) === null ? "" : `${daysUntil(item.date)} days`}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="No planning deadlines"
                description="Assign drop days and production timings to see reverse-planning deadlines here."
              />
            )}
          </div>
        </Card>

        <Card title="Calendar Agenda">
          <p className="mb-4 text-sm text-slate-400">
            Next scheduled sample arrivals, bulk-ready dates, arrivals, and drop days in calendar
            order.
          </p>
          <div className="space-y-3">
            {calendarAgendaItems.length ? (
              calendarAgendaItems.map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:brightness-110",
                    getCalendarEventClasses(item.type),
                  )}
                  onClick={() => onOpenCalendarItem(item)}
                >
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm opacity-80">{formatDate(item.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-[0.16em] opacity-70">
                      {item.type === "drop-day" ? "Drop day" : item.type.replace("-", " ")}
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {daysUntil(item.date) === null ? "" : `${daysUntil(item.date)} days`}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="Nothing on the calendar yet"
                description="Once products have sample, bulk, arrival, or drop dates, the calendar agenda will show them here."
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/15 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
          </div>
          <button
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ProductDrawer({
  open,
  productEditor,
  selectedProduct,
  saving,
  drawerTab,
  setDrawerTab,
  costDraft,
  costEditor,
  dropDays,
  setProductEditor,
  setCostDraft,
  setCostEditor,
  handleProductImageUpload,
  handleRemoveProductImage,
  handleSaveProduct,
  handleAddCostEntry,
  handleSaveEditedCost,
  startEditingCost,
  handleDeleteCostEntry,
  cancelEditingCost,
  onClose,
}: {
  open: boolean;
  productEditor: Product | null;
  selectedProduct: ProductWithCosts | null;
  saving: boolean;
  drawerTab: DrawerTab;
  setDrawerTab: React.Dispatch<React.SetStateAction<DrawerTab>>;
  costDraft: CostEntryDraft;
  costEditor: CostEditorState;
  dropDays: DropDay[];
  setProductEditor: React.Dispatch<React.SetStateAction<Product | null>>;
  setCostDraft: React.Dispatch<React.SetStateAction<CostEntryDraft>>;
  setCostEditor: React.Dispatch<React.SetStateAction<CostEditorState>>;
  handleProductImageUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleRemoveProductImage: () => Promise<void>;
  handleSaveProduct: () => Promise<void>;
  handleAddCostEntry: () => Promise<void>;
  handleSaveEditedCost: () => Promise<void>;
  startEditingCost: (entry: CostEntry) => void;
  handleDeleteCostEntry: (entryId: string) => Promise<void>;
  cancelEditingCost: () => void;
  onClose: () => void;
}) {
  if (!open || !productEditor || !selectedProduct) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/15 backdrop-blur-sm">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <div className="absolute inset-y-0 right-0 w-full max-w-[760px] overflow-y-auto border-l border-slate-200 bg-stone-100 shadow-2xl shadow-slate-300/60">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <ProductImagePreview
                imagePath={productEditor.imagePath}
                productName={productEditor.name}
                variant="list"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {getStatusLabel(productEditor.status)}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{productEditor.name}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {getDropDayName(dropDays, productEditor.dropDayId)} · Next action:{" "}
                  {getProductNextAction(productEditor)}
                </p>
              </div>
            </div>
            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(["overview", "timeline", "costs", "activity"] as DrawerTab[]).map((tab) => (
              <button
                key={tab}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium capitalize transition",
                  drawerTab === tab
                    ? "bg-emerald-400 text-slate-950"
                    : "text-slate-600 hover:bg-white",
                )}
                onClick={() => setDrawerTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {drawerTab === "overview" ? (
            <Card title="Overview">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                  <ProductImagePreview
                    imagePath={productEditor.imagePath}
                    productName={productEditor.name}
                    variant="detail"
                  />
                  <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Product image</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Upload a product photo so each item is easier to recognize on the board.
                      </p>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm text-slate-600">Upload image file</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-400 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-950 hover:file:bg-emerald-300"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => void handleProductImageUpload(event)}
                        disabled={saving}
                      />
                    </label>

                    {productEditor.imagePath ? (
                      <button
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                        onClick={() => void handleRemoveProductImage()}
                        disabled={saving}
                      >
                        Remove image
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3">
                  <Input
                    label="Product name"
                    value={productEditor.name}
                    onChange={(value) =>
                      setProductEditor((current) => (current ? { ...current, name: value } : current))
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Category"
                      value={productEditor.category}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, category: value } : current,
                        )
                      }
                    />
                    <Input
                      label="Supplier"
                      value={productEditor.supplier}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, supplier: value } : current,
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      label="Status"
                      value={productEditor.status}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, status: value as ProductStatus } : current,
                        )
                      }
                      options={productStatuses.map((status) => ({
                        value: status,
                        label: getStatusLabel(status),
                      }))}
                    />
                    <Select
                      label="Drop day"
                      value={productEditor.dropDayId ?? ""}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, dropDayId: value || null } : current,
                        )
                      }
                      options={[
                        { value: "", label: "No drop assigned" },
                        ...dropDays.map((dropDay) => ({
                          value: dropDay.id,
                          label: dropDay.name,
                        })),
                      ]}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Owner"
                      value={productEditor.owner}
                      onChange={(value) =>
                        setProductEditor((current) => (current ? { ...current, owner: value } : current))
                      }
                    />
                    <Select
                      label="Priority"
                      value={productEditor.priority}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, priority: value as ProductPriority } : current,
                        )
                      }
                      options={productPriorityOptions}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select
                      label="Next action"
                      value={productEditor.workflowAction ?? ""}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current
                            ? {
                                ...current,
                                workflowAction: (value || null) as WorkflowAction | null,
                              }
                            : current,
                        )
                      }
                      options={[
                        {
                          value: "",
                          label: `Automatic (${getAutomaticProductNextAction(productEditor)})`,
                        },
                        ...workflowActionOptions.slice(1),
                      ]}
                    />
                    <Input
                      label="Manual next action (overrides dropdown)"
                      value={productEditor.nextAction}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, nextAction: value } : current,
                        )
                      }
                    />
                    <Input
                      label="Due date"
                      type="date"
                      value={productEditor.dueDate ?? ""}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, dueDate: value || null } : current,
                        )
                      }
                    />
                  </div>
                  <TextArea
                    label="Notes"
                    value={productEditor.notes}
                    onChange={(value) =>
                      setProductEditor((current) => (current ? { ...current, notes: value } : current))
                    }
                  />
                </div>
              </div>
            </Card>
          ) : null}

          {drawerTab === "timeline" ? (
            <Card title="Timeline">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Sample ordered"
                    type="date"
                    value={productEditor.sampleOrderedAt ?? ""}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current ? { ...current, sampleOrderedAt: value || null } : current,
                      )
                    }
                  />
                  <Input
                    label="Sample production business days"
                    type="number"
                    value={String(productEditor.sampleProductionDays)}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current
                          ? { ...current, sampleProductionDays: Number(value || "0") }
                          : current,
                      )
                    }
                  />
                  <Input
                    label="Sample shipping business days"
                    type="number"
                    value={String(productEditor.sampleShippingDays)}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current
                          ? { ...current, sampleShippingDays: Number(value || "0") }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Bulk start"
                    type="date"
                    value={productEditor.bulkStartDate ?? ""}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current ? { ...current, bulkStartDate: value || null } : current,
                      )
                    }
                  />
                  <Input
                    label="Production business days"
                    type="number"
                    value={String(productEditor.productionDays)}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current ? { ...current, productionDays: Number(value || "0") } : current,
                      )
                    }
                  />
                  <Input
                    label="Shipping business days"
                    type="number"
                    value={String(productEditor.shippingDays)}
                    onChange={(value) =>
                      setProductEditor((current) =>
                        current ? { ...current, shippingDays: Number(value || "0") } : current,
                      )
                    }
                  />
                </div>
                <TimelineSummary product={productEditor} />
              </div>
            </Card>
          ) : null}

          {drawerTab === "costs" ? (
            <Card title="Costs">
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">
                    Total product cost
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {currency(getProductTotalCost(selectedProduct))}
                  </p>
                  <p className="mt-1 text-sm text-emerald-700/80">
                    {selectedProduct.costs.length} expense entries for {selectedProduct.name}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">
                      {costEditor.id ? "Edit cost entry" : "Add cost entry"}
                    </p>
                    {costEditor.id ? (
                      <button
                        className="text-sm text-slate-600 transition hover:text-slate-900"
                        onClick={cancelEditingCost}
                      >
                        Cancel edit
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-3">
                    <Input
                      label="Cost title"
                      value={costEditor.id ? costEditor.draft.title : costDraft.title}
                      onChange={(value) =>
                        costEditor.id
                          ? setCostEditor((current) => ({
                              ...current,
                              draft: { ...current.draft, title: value },
                            }))
                          : setCostDraft((current) => ({ ...current, title: value }))
                      }
                    />
                    <TextArea
                      label="Description"
                      value={costEditor.id ? costEditor.draft.description : costDraft.description}
                      onChange={(value) =>
                        costEditor.id
                          ? setCostEditor((current) => ({
                              ...current,
                              draft: { ...current.draft, description: value },
                            }))
                          : setCostDraft((current) => ({ ...current, description: value }))
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Amount"
                        type="number"
                        value={String(costEditor.id ? costEditor.draft.amount : costDraft.amount)}
                        onChange={(value) =>
                          costEditor.id
                            ? setCostEditor((current) => ({
                                ...current,
                                draft: { ...current.draft, amount: Number(value || "0") },
                              }))
                            : setCostDraft((current) => ({
                                ...current,
                                amount: Number(value || "0"),
                              }))
                        }
                      />
                      <Input
                        label="Entry date"
                        type="date"
                        value={costEditor.id ? costEditor.draft.entryDate : costDraft.entryDate}
                        onChange={(value) =>
                          costEditor.id
                            ? setCostEditor((current) => ({
                                ...current,
                                draft: { ...current.draft, entryDate: value },
                              }))
                            : setCostDraft((current) => ({ ...current, entryDate: value }))
                        }
                      />
                    </div>
                    <Select
                      label="Cost type"
                      value={costEditor.id ? costEditor.draft.costType : costDraft.costType}
                      onChange={(value) =>
                        costEditor.id
                          ? setCostEditor((current) => ({
                              ...current,
                              draft: {
                                ...current.draft,
                                costType: value as CostEntry["costType"],
                              },
                            }))
                          : setCostDraft((current) => ({
                              ...current,
                              costType: value as CostEntry["costType"],
                            }))
                      }
                      options={costTypes.map((type) => ({
                        value: type,
                        label: type.charAt(0).toUpperCase() + type.slice(1),
                      }))}
                    />
                  </div>

                  <button
                    className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={() =>
                      void (costEditor.id ? handleSaveEditedCost() : handleAddCostEntry())
                    }
                    disabled={saving}
                  >
                    {costEditor.id ? "Save cost changes" : "Add cost entry"}
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedProduct.costs.length ? (
                    [...selectedProduct.costs]
                      .sort((left, right) => right.entryDate.localeCompare(left.entryDate))
                      .map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">{entry.title}</p>
                              <p className="mt-1 text-sm text-slate-600">
                                {entry.description || "No description"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-emerald-700">
                                {currency(entry.amount)}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                {entry.costType}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">{formatDate(entry.entryDate)}</p>
                            <div className="flex gap-2">
                              <button
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                                onClick={() => startEditingCost(entry)}
                              >
                                Edit
                              </button>
                              <button
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                                onClick={() => void handleDeleteCostEntry(entry.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : (
                    <EmptyState
                      title="No costs yet"
                      description="Add sample, material, freight, or packaging costs to understand total landed cost."
                    />
                  )}
                </div>
              </div>
            </Card>
          ) : null}

          {drawerTab === "activity" ? (
            <Card title="Activity">
              <div className="space-y-3">
                {selectedProduct.activity.length ? (
                  selectedProduct.activity.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-medium text-slate-900">{entry.message}</p>
                      <p className="mt-2 text-sm text-slate-600">{entry.user}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt.slice(0, 10))}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No activity yet"
                    description="Changes to this product will be tracked here so your team can see what happened."
                  />
                )}
              </div>
            </Card>
          ) : null}

          <div className="flex justify-end">
            <button
              className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => void handleSaveProduct()}
              disabled={saving}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductBoard({
  products,
  dropDays,
  onSelectProduct,
  onMoveStatus,
  selectedProductId,
}: {
  products: ProductWithCosts[];
  dropDays: DropDay[];
  onSelectProduct: (product: ProductWithCosts) => void;
  onMoveStatus: (productId: string, status: ProductStatus) => void;
  selectedProductId: string | null;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {productStatuses.map((status) => {
        const statusProducts = products.filter((product) => product.status === status);

        return (
          <div
            key={status}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{getStatusLabel(status)}</h2>
                <p className="text-xs text-slate-400">{statusProducts.length} products</p>
              </div>
            </div>

            <div className="space-y-3 xl:max-h-[720px] xl:overflow-y-auto xl:pr-1">
              {statusProducts.length ? (
                statusProducts.map((product) => {
                  const primaryMilestone = getProductPrimaryMilestone(product, dropDays);
                  const nextAction = getProductNextAction(product);

                  return (
                    <button
                      key={product.id}
                      className={cn(
                        "w-full rounded-3xl border p-3 text-left transition",
                        selectedProductId === product.id
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-slate-50 hover:bg-white",
                      )}
                      onClick={() => onSelectProduct(product)}
                    >
                      <div className="flex items-start gap-3">
                        <ProductImagePreview
                          imagePath={product.imagePath}
                          productName={product.name}
                          variant="card"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">{product.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {product.category}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                              {currency(getProductTotalCost(product))}
                            </span>
                          </div>

                          <p className="mt-2 truncate text-xs text-slate-500">
                            {getDropDayName(dropDays, product.dropDayId)}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {product.owner ? (
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                                {product.owner}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]",
                                getPriorityBadgeClasses(product.priority),
                              )}
                            >
                              {product.priority}
                            </span>
                          </div>

                          <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-600">
                              Next action
                            </p>
                            <p className="mt-1 text-sm font-medium text-cyan-800">{nextAction}</p>
                          </div>

                          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              {primaryMilestone.label}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                              {formatDate(primaryMilestone.date)}
                            </p>
                          </div>

                          <div className="mt-3">
                            <Select
                              label="Move to"
                              value={product.status}
                              onChange={(value) =>
                                void onMoveStatus(product.id, value as ProductStatus)
                              }
                              options={productStatuses.map((item) => ({
                                value: item,
                                label: getStatusLabel(item),
                              }))}
                              compact
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <EmptyState
                  title={`No ${getStatusLabel(status).toLowerCase()} products`}
                  description="Move products here as they progress through the workflow."
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductListView({
  products,
  dropDays,
  onSelectProduct,
  onMoveStatus,
  selectedProductId,
}: {
  products: ProductWithCosts[];
  dropDays: DropDay[];
  onSelectProduct: (product: ProductWithCosts) => void;
  onMoveStatus: (productId: string, status: ProductStatus) => void;
  selectedProductId: string | null;
}) {
  return (
    <Card title="Products List">
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.3fr_1.1fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <div>Product</div>
          <div>Status</div>
          <div>Drop</div>
          <div>Next action</div>
          <div>Next date</div>
          <div>Cost</div>
          <div>Move</div>
        </div>

        <div className="max-h-[720px] overflow-y-auto">
          {products.length ? (
            products.map((product) => {
              const primaryMilestone = getProductPrimaryMilestone(product, dropDays);
              const nextAction = getProductNextAction(product);

              return (
                <div
                  key={product.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,2.2fr)_1fr_1.2fr_1.3fr_1.1fr_0.9fr_0.9fr] items-center gap-3 border-b border-slate-200 px-4 py-3 transition",
                    selectedProductId === product.id && "bg-emerald-50",
                    getUrgencyTone(product, dropDays),
                  )}
                >
                  <button
                    className="flex min-w-0 items-center gap-3 text-left"
                    onClick={() => onSelectProduct(product)}
                  >
                    <ProductImagePreview
                      imagePath={product.imagePath}
                      productName={product.name}
                      variant="list"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{product.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {product.category}
                        {product.owner ? ` · ${product.owner}` : ""}
                      </p>
                    </div>
                  </button>

                  <div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-1 text-[11px] font-medium",
                        getStatusBadgeClasses(product.status),
                      )}
                    >
                      {getStatusLabel(product.status)}
                    </span>
                  </div>

                  <div className="truncate text-sm text-slate-600">
                    {getDropDayName(dropDays, product.dropDayId)}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em]",
                          getPriorityBadgeClasses(product.priority),
                        )}
                      >
                        {product.priority}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-cyan-800">{nextAction}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                      {primaryMilestone.label}
                    </p>
                    <p className="truncate text-sm text-slate-900">
                      {formatDate(primaryMilestone.date)}
                    </p>
                  </div>

                  <div className="text-sm font-medium text-slate-900">
                    {currency(getProductTotalCost(product))}
                  </div>

                  <div>
                    <Select
                      label="Move to"
                      value={product.status}
                      onChange={(value) =>
                        void onMoveStatus(product.id, value as ProductStatus)
                      }
                      options={productStatuses.map((item) => ({
                        value: item,
                        label: getStatusLabel(item),
                      }))}
                      compact
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6">
              <EmptyState
                title="No products yet"
                description="Add a product to start building your catalog view."
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProductImagePreview({
  imagePath,
  productName,
  variant,
}: {
  imagePath: string | null;
  productName: string;
  variant: "card" | "detail" | "list";
}) {
  const imageUrl = getProductImageUrl(imagePath);
  const sizeClasses =
    variant === "card"
      ? "h-14 w-14 shrink-0 rounded-2xl"
      : variant === "list"
        ? "h-12 w-12 shrink-0 rounded-2xl"
        : "h-36 w-full rounded-3xl sm:h-full";

  if (!imageUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.2em] text-slate-500",
          sizeClasses,
        )}
      >
        No image
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden border border-slate-200 bg-white", sizeClasses)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={`${productName} preview`}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function CalendarView({
  calendarMonth,
  onPrevious,
  onNext,
  items,
  mode,
  onModeChange,
  onAddCustomEvent,
  onEventClick,
  onEventDrop,
}: {
  calendarMonth: Date;
  onPrevious: () => void;
  onNext: () => void;
  items: CalendarItem[];
  mode: "month" | "agenda";
  onModeChange: (mode: "month" | "agenda") => void;
  onAddCustomEvent: () => void;
  onEventClick: (item: CalendarItem) => void;
  onEventDrop: (item: CalendarItem, targetDate: string) => void;
}) {
  const calendarStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const eventsByDate = items.reduce<Record<string, typeof items>>((accumulator, item) => {
    if (!accumulator[item.date]) {
      accumulator[item.date] = [];
    }
    accumulator[item.date].push(item);
    return accumulator;
  }, {});

  return (
    <Card title="Calendar / Schedule">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <button
            className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50"
            onClick={onPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Viewing month</p>
            <p className="mt-1 text-xl font-semibold">{format(calendarMonth, "MMMM yyyy")}</p>
          </div>
          <button
            className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:bg-slate-50"
            onClick={onNext}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
            onClick={onAddCustomEvent}
          >
            <Plus className="h-4 w-4" />
            Add event
          </button>
          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <button
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                mode === "month" ? "bg-emerald-400 text-slate-950" : "text-slate-600 hover:bg-white",
              )}
              onClick={() => onModeChange("month")}
            >
              Month
            </button>
            <button
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                mode === "agenda" ? "bg-emerald-400 text-slate-950" : "text-slate-600 hover:bg-white",
              )}
              onClick={() => onModeChange("agenda")}
            >
              Agenda
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["sample", "Sample arrival"],
          ["bulk", "Bulk ready"],
          ["arrival", "Arrival"],
          ["drop", "Target drop"],
          ["drop-day", "Drop day"],
          ["custom", "Custom event"],
        ].map(([type, label]) => (
          <div
            key={type}
            className={cn(
              "rounded-full border px-3 py-2 text-xs font-medium",
              getCalendarEventClasses(type as CalendarItemType),
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {mode === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.18em] text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="rounded-2xl px-2 py-3">
                {day}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-7">
            {days.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dailyEvents = eventsByDate[dateKey] ?? [];

              return (
                <div
                  key={dateKey}
                  className={cn(
                    "min-h-36 rounded-3xl border p-3 transition",
                    isSameMonth(day, calendarMonth)
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-50/70",
                    isToday(day) && "border-emerald-300 bg-emerald-50",
                    dragOverDate === dateKey && "border-cyan-300 bg-cyan-50",
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedEventId) {
                      setDragOverDate(dateKey);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverDate === dateKey) {
                      setDragOverDate(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const eventId = event.dataTransfer.getData("text/calendar-item");
                    const droppedItem = items.find((item) => item.id === eventId);
                    setDraggedEventId(null);
                    setDragOverDate(null);

                    if (!droppedItem || droppedItem.date === dateKey) {
                      return;
                    }

                    onEventDrop(droppedItem, dateKey);
                  }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                        isToday(day) ? "bg-emerald-400 text-slate-950" : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {format(day, "EEE")}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {dailyEvents.length ? (
                      dailyEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          draggable={event.draggable}
                          onDragStart={(dragEvent) => {
                            dragEvent.dataTransfer.setData("text/calendar-item", event.id);
                            dragEvent.dataTransfer.effectAllowed = "move";
                            setDraggedEventId(event.id);
                          }}
                          onDragEnd={() => {
                            setDraggedEventId(null);
                            setDragOverDate(null);
                          }}
                          onClick={() => onEventClick(event)}
                          className={cn(
                            "w-full rounded-2xl border px-3 py-2 text-left text-xs font-medium transition hover:brightness-110",
                            getCalendarEventClasses(event.type),
                            draggedEventId === event.id && "opacity-50",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="leading-tight">{event.label}</span>
                            {event.draggable ? (
                              <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] opacity-70">
                                Drag
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No scheduled items</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {items.length ? (
            items.map((item) => (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition hover:brightness-110",
                  getCalendarEventClasses(item.type),
                )}
                onClick={() => onEventClick(item)}
              >
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-sm opacity-80">{formatDate(item.date)}</p>
                </div>
                {item.draggable ? (
                  <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">Drag in month</span>
                ) : null}
              </button>
            ))
          ) : (
            <EmptyState
              title="Nothing scheduled"
              description="Once products have milestone dates, the agenda view will show them here in order."
            />
          )}
        </div>
      )}
    </Card>
  );
}

function DropDayOverview({
  dropDays,
  products,
  onOpenDrop,
  onEditDrop,
  onToggleArchive,
}: {
  dropDays: DropDay[];
  products: ProductWithCosts[];
  onOpenDrop: (dropDayId: string) => void;
  onEditDrop: (dropDay: DropDay) => void;
  onToggleArchive: (dropDayId: string, archived: boolean) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {dropDays.length ? (
        dropDays.map((dropDay) => {
          const dropProducts = products.filter((product) => product.dropDayId === dropDay.id);
          const totalCost = dropProducts.reduce(
            (sum, product) => sum + getProductTotalCost(product),
            0,
          );

          return (
            <div
              key={dropDay.id}
              className="rounded-[28px] border border-slate-200 bg-white p-5 text-left transition hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-slate-900">{dropDay.name}</h3>
                    {dropDay.archived ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{dropDay.description}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    {formatDate(dropDay.targetDate)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => onEditDrop(dropDay)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => onToggleArchive(dropDay.id, !dropDay.archived)}
                    >
                      {dropDay.archived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-white"
                onClick={() => onOpenDrop(dropDay.id)}
              >
                Open drop workspace
              </button>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniMetric
                  label="Products"
                  value={String(dropProducts.length)}
                  accent="text-slate-900"
                />
                <MiniMetric
                  label="Bulk items"
                  value={String(
                    dropProducts.filter((product) => product.status === "bulk").length,
                  )}
                  accent="text-amber-700"
                />
                <MiniMetric
                  label="Tracked cost"
                  value={currency(totalCost)}
                  accent="text-emerald-700"
                />
              </div>
            </div>
          );
        })
      ) : (
        <div className="lg:col-span-2">
          <EmptyState
            title="No drop days yet"
            description="Create a drop day to group ideas, samples, bulk products, and canceled items around a planned release."
          />
        </div>
      )}
    </div>
  );
}

function TimelineSummary({ product }: { product: Product }) {
  const sampleArrivalDate = calculateSampleArrivalDate(
    product.sampleOrderedAt,
    product.sampleProductionDays,
    product.sampleShippingDays,
  );
  const bulkReadyDate = calculateBulkReadyDate(product.bulkStartDate, product.productionDays);
  const arrivalDate = calculateArrivalDate(
    product.bulkStartDate,
    product.productionDays,
    product.shippingDays,
  );

  const sampleCountdown = daysUntil(sampleArrivalDate);
  const bulkCountdown = daysUntil(bulkReadyDate);
  const arrivalCountdown = daysUntil(arrivalDate);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
          Estimated sample arrival
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(sampleArrivalDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {sampleCountdown === null
            ? "Add sample ordered date plus production and shipping business days."
            : `${sampleCountdown} days from today`}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Estimated bulk ready</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(bulkReadyDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {bulkCountdown === null
            ? "Add a bulk start date and production business-day lead time."
            : `${bulkCountdown} days from today`}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Estimated arrival</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">{formatDate(arrivalDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {arrivalCountdown === null
            ? "Add shipping business days to estimate delivery."
            : `${arrivalCountdown} days from today`}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Layers3;
  onClick?: () => void;
}) {
  const className = cn(
    "rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm",
    onClick && "transition hover:bg-slate-50 hover:border-slate-300",
  );

  if (onClick) {
    return (
      <button className={className} onClick={onClick}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <Icon className="h-5 w-5 text-emerald-700" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <Icon className="h-5 w-5 text-emerald-700" />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={cn("mt-2 text-lg font-semibold", accent)}>{value}</p>
    </div>
  );
}

function Banner({
  tone,
  message,
  onDismiss,
}: {
  tone: "error" | "success";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      )}
    >
      <p>{message}</p>
      <button className="text-xs uppercase tracking-[0.18em]" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "number" | "email" | "password";
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isDateField = type === "date";

  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-600">{label}</span>
      <div className="relative">
        <input
          ref={inputRef}
          className={cn(
            "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400",
            isDateField && "pr-12",
          )}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {isDateField ? (
          <button
            type="button"
            className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-600 transition hover:bg-white"
            onClick={() => {
              const input = inputRef.current;
              if (!input) {
                return;
              }

              const pickerInput = input as HTMLInputElement & {
                showPicker?: () => void;
              };
              input.focus();
              if (pickerInput.showPicker) {
                pickerInput.showPicker();
              } else {
                input.click();
              }
            }}
            aria-label={`Choose ${label}`}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-sm text-slate-600">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <label className="block">
      {!compact ? <span className="mb-2 block text-sm text-slate-600">{label}</span> : null}
      <select
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-white text-sm text-slate-900 outline-none transition focus:border-emerald-400",
          compact ? "px-3 py-2.5" : "px-4 py-3",
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
