"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
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
  AppData,
  AuthMode,
  CostEntry,
  CostEntryDraft,
  DropDay,
  DropDayDraft,
  Product,
  ProductDraft,
  ProductStatus,
  ProductWithCosts,
} from "@/lib/types";
import { costTypes, productStatuses } from "@/lib/types";
import { cn, createId } from "@/lib/utils";

type View = "dashboard" | "products" | "calendar" | "drops";
type Scope = "all" | string;
type ProductLayout = "board" | "list";

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

function mapDropDayRow(row: DropDayRow): DropDay {
  return {
    id: row.id,
    name: row.name,
    targetDate: row.target_date,
    description: row.description ?? "",
    createdAt: row.created_at,
  };
}

function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    supplier: row.supplier,
    imagePath: row.image_path,
    status: row.status,
    dropDayId: row.drop_day_id,
    notes: row.notes ?? "",
    sampleOrderedAt: row.sample_ordered_at,
    sampleProductionDays: row.sample_production_days ?? 0,
    sampleShippingDays: row.sample_shipping_days ?? 0,
    bulkStartDate: row.bulk_start_date,
    productionDays: row.production_days ?? 0,
    shippingDays: row.shipping_days ?? 0,
    targetLaunchDate: row.target_launch_date,
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
    notes: product.notes,
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

function getProductPrimaryMilestone(product: Product) {
  const timeline = getProductTimeline(product);

  if (product.status === "idea") {
    return {
      label: "Target drop",
      date: product.targetLaunchDate,
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

  return {
    label: "Last update",
    date: product.updatedAt.slice(0, 10),
  };
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
  const [productLayout, setProductLayout] = useState<ProductLayout>("board");
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

  const selectedProduct = useMemo(
    () =>
      productsWithCosts.find((product) => product.id === selectedProductId) ??
      filteredProducts[0] ??
      null,
    [filteredProducts, productsWithCosts, selectedProductId],
  );

  const upcomingBulkReady = useMemo(() => {
    return filteredProducts
      .map((product) => ({
        product,
        bulkReadyDate: getProductTimeline(product).bulkReadyDate,
      }))
      .filter((item) => item.bulkReadyDate)
      .sort((left, right) =>
        (left.bulkReadyDate ?? "").localeCompare(right.bulkReadyDate ?? ""),
      )
      .slice(0, 4);
  }, [filteredProducts]);

  const upcomingArrivals = useMemo(() => {
    return filteredProducts
      .map((product) => ({
        product,
        arrivalDate: getProductTimeline(product).arrivalDate,
      }))
      .filter((item) => item.arrivalDate)
      .sort((left, right) =>
        (left.arrivalDate ?? "").localeCompare(right.arrivalDate ?? ""),
      )
      .slice(0, 4);
  }, [filteredProducts]);

  useEffect(() => {
    void initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncSelection(nextData: AppData, preferredProductId?: string | null) {
    const nextSelectedProduct =
      nextData.products.find((product) => product.id === preferredProductId) ??
      nextData.products[0] ??
      null;

    setSelectedProductId(nextSelectedProduct?.id ?? null);
    setProductEditor(nextSelectedProduct);
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
      description: newDropDay.description,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await refreshSupabaseData();
    setDropDraft(emptyDropDayDraft);
    setSaving(false);
    setMessage("Drop day added.");
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
      await persistData(
        {
          ...data,
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

    await refreshSupabaseData();
    setCostDraft(emptyCostDraft);
    setSaving(false);
    setMessage("Cost entry added.");
  }

  const calendarItems = useMemo(() => {
    const productItems = filteredProducts.flatMap((product) => {
      const timeline = getProductTimeline(product);

      return [
        timeline.sampleArrivalDate
          ? {
              id: `${product.id}-sample-arrival`,
              date: timeline.sampleArrivalDate,
              label: `${product.name} sample arrival`,
              type: "sample" as const,
            }
          : null,
        product.targetLaunchDate
          ? {
              id: `${product.id}-launch`,
              date: product.targetLaunchDate,
              label: `${product.name} target drop`,
              type: "drop" as const,
            }
          : null,
        timeline.bulkReadyDate
          ? {
              id: `${product.id}-bulk`,
              date: timeline.bulkReadyDate,
              label: `${product.name} bulk ready`,
              type: "bulk" as const,
            }
          : null,
        timeline.arrivalDate
          ? {
              id: `${product.id}-arrival`,
              date: timeline.arrivalDate,
              label: `${product.name} arrival`,
              type: "arrival" as const,
            }
          : null,
      ].filter(Boolean);
    });

    const dropItems = data.dropDays
      .filter((dropDay) => scope === "all" || dropDay.id === scope)
      .map((dropDay) => ({
        id: `${dropDay.id}-drop-day`,
        date: dropDay.targetDate,
        label: `${dropDay.name}`,
        type: "drop-day" as const,
      }));

    return [...productItems, ...dropItems]
      .filter((item): item is NonNullable<(typeof productItems)[number]> => Boolean(item))
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [data.dropDays, filteredProducts, scope]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5">
          Loading your product pipeline...
        </div>
      </div>
    );
  }

  if (authMode === "supabase" && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
        <div className="mx-auto max-w-md rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20">
          <div className="mb-8 space-y-3">
            <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              Private internal app
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Order Buddy</h1>
            <p className="text-sm text-slate-300">
              Sign in with your Supabase email and password to manage products, costs,
              and drop days with your business partner.
            </p>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Email</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none ring-0 transition focus:border-emerald-400"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">Password</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 outline-none transition focus:border-emerald-400"
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
              <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
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
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        <header className="mb-6 rounded-[28px] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                  {authMode === "demo" ? "Demo mode" : "Shared live workspace"}
                </span>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  {activeUserEmail}
                </span>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Order Buddy</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Track golf apparel ideas, samples, production, arrival windows, and total
                product costs in one shared workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {authMode === "supabase" ? (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                  onClick={() => void handleSignOut()}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)_380px]">
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-sm font-medium text-slate-300">Views</p>
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
                          : "bg-slate-900/70 text-slate-200 hover:bg-white/10",
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

            <section className="rounded-[28px] border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-sm font-medium text-slate-300">Product scope</p>
              <div className="space-y-2">
                <button
                  className={cn(
                    "w-full rounded-2xl px-4 py-3 text-left text-sm transition",
                    scope === "all"
                      ? "bg-emerald-400 text-slate-950"
                      : "bg-slate-900/70 text-slate-200 hover:bg-white/10",
                  )}
                  onClick={() => setScope("all")}
                >
                  All products
                </button>
                {data.dropDays.map((dropDay) => (
                  <button
                    key={dropDay.id}
                    className={cn(
                      "w-full rounded-2xl px-4 py-3 text-left text-sm transition",
                      scope === dropDay.id
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-900/70 text-slate-200 hover:bg-white/10",
                    )}
                    onClick={() => {
                      setScope(dropDay.id);
                      setView("products");
                    }}
                  >
                    <div className="font-medium">{dropDay.name}</div>
                    <div className="mt-1 text-xs opacity-80">
                      Target {formatDate(dropDay.targetDate)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main
            className={cn(
              "space-y-6",
              view === "products" && "xl:col-span-2",
            )}
          >
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
                upcomingBulkReady={upcomingBulkReady}
                upcomingArrivals={upcomingArrivals}
                dropDays={data.dropDays}
              />
            ) : null}

            {view === "products" ? (
              <>
                <Card title="Add Product">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Input
                      label="Product name"
                      value={productDraft.name}
                      onChange={(value) =>
                        setProductDraft((current) => ({ ...current, name: value }))
                      }
                    />
                    <Input
                      label="SKU / style code"
                      value={productDraft.sku}
                      onChange={(value) =>
                        setProductDraft((current) => ({ ...current, sku: value }))
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
                      label="Target launch date"
                      type="date"
                      value={productDraft.targetLaunchDate ?? ""}
                      onChange={(value) =>
                        setProductDraft((current) => ({
                          ...current,
                          targetLaunchDate: value || null,
                        }))
                      }
                    />
                    <TextArea
                      label="Notes"
                      value={productDraft.notes}
                      onChange={(value) =>
                        setProductDraft((current) => ({ ...current, notes: value }))
                      }
                      className="md:col-span-2 xl:col-span-3"
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                      onClick={() => void handleAddProduct()}
                      disabled={saving}
                    >
                      <Plus className="h-4 w-4" />
                      Add product
                    </button>
                  </div>
                </Card>

                <Card title="Products Workspace">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm text-slate-300">
                        {filteredProducts.length} products in {getScopeLabel(scope, data.dropDays)}.
                        Use the board to move items by stage, or switch to list view to scan a
                        larger catalog faster.
                      </p>
                    </div>
                    <div className="inline-flex rounded-2xl border border-white/10 bg-slate-900/70 p-1">
                      <button
                        className={cn(
                          "rounded-xl px-4 py-2 text-sm font-medium transition",
                          productLayout === "board"
                            ? "bg-emerald-400 text-slate-950"
                            : "text-slate-300 hover:bg-white/5",
                        )}
                        onClick={() => setProductLayout("board")}
                      >
                        Board view
                      </button>
                      <button
                        className={cn(
                          "rounded-xl px-4 py-2 text-sm font-medium transition",
                          productLayout === "list"
                            ? "bg-emerald-400 text-slate-950"
                            : "text-slate-300 hover:bg-white/5",
                        )}
                        onClick={() => setProductLayout("list")}
                      >
                        List view
                      </button>
                    </div>
                  </div>
                </Card>

                {productLayout === "board" ? (
                  <ProductBoard
                    products={filteredProducts}
                    dropDays={data.dropDays}
                    onSelectProduct={(product) => {
                      setSelectedProductId(product.id);
                      setProductEditor(product);
                    }}
                    onMoveStatus={handleQuickStatusUpdate}
                    selectedProductId={selectedProductId}
                  />
                ) : (
                  <ProductListView
                    products={filteredProducts}
                    dropDays={data.dropDays}
                    onSelectProduct={(product) => {
                      setSelectedProductId(product.id);
                      setProductEditor(product);
                    }}
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
              />
            ) : null}

            {view === "drops" ? (
              <>
                <Card title="Create Drop Day">
                  <div className="grid gap-3 md:grid-cols-3">
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
                      className="md:col-span-3"
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
                      onClick={() => void handleAddDropDay()}
                      disabled={saving}
                    >
                      <Plus className="h-4 w-4" />
                      Add drop day
                    </button>
                  </div>
                </Card>

                <DropDayOverview
                  dropDays={data.dropDays}
                  products={productsWithCosts}
                  onOpenDrop={(dropDayId) => {
                    setScope(dropDayId);
                    setView("products");
                  }}
                />
              </>
            ) : null}
          </main>

          <aside
            className={cn(
              "space-y-6",
              view === "products" && "xl:col-span-2 xl:col-start-2 xl:grid xl:grid-cols-2 xl:gap-6 xl:space-y-0",
            )}
          >
            <Card title="Product Detail">
              {productEditor ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <ProductImagePreview
                      imagePath={productEditor.imagePath}
                      productName={productEditor.name}
                      variant="detail"
                    />
                    <div className="space-y-3 rounded-3xl border border-white/10 bg-slate-900/50 p-4">
                      <div>
                        <p className="text-sm font-medium text-white">Product image</p>
                        <p className="mt-1 text-sm text-slate-400">
                          Upload a product photo so each item is easier to recognize on the
                          board.
                        </p>
                      </div>

                      <label className="block">
                        <span className="mb-2 block text-sm text-slate-300">
                          Upload image file
                        </span>
                        <input
                          className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-400 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-950 hover:file:bg-emerald-300"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={(event) => void handleProductImageUpload(event)}
                          disabled={saving}
                        />
                      </label>

                      <p className="text-xs text-slate-500">
                        PNG, JPG, WebP, or GIF up to 5 MB. The image will show on the
                        product card and detail view.
                      </p>

                      {productEditor.imagePath ? (
                        <button
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
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
                        setProductEditor((current) =>
                          current ? { ...current, name: value } : current,
                        )
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="SKU"
                        value={productEditor.sku}
                        onChange={(value) =>
                          setProductEditor((current) =>
                            current ? { ...current, sku: value } : current,
                          )
                        }
                      />
                      <Input
                        label="Category"
                        value={productEditor.category}
                        onChange={(value) =>
                          setProductEditor((current) =>
                            current ? { ...current, category: value } : current,
                          )
                        }
                      />
                    </div>
                    <Input
                      label="Supplier"
                      value={productEditor.supplier}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, supplier: value } : current,
                        )
                      }
                    />
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
                        ...data.dropDays.map((dropDay) => ({
                          value: dropDay.id,
                          label: dropDay.name,
                        })),
                      ]}
                    />
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
                            current
                              ? { ...current, productionDays: Number(value || "0") }
                              : current,
                          )
                        }
                      />
                      <Input
                        label="Shipping business days"
                        type="number"
                        value={String(productEditor.shippingDays)}
                        onChange={(value) =>
                          setProductEditor((current) =>
                            current
                              ? { ...current, shippingDays: Number(value || "0") }
                              : current,
                          )
                        }
                      />
                    </div>
                    <Input
                      label="Target launch date"
                      type="date"
                      value={productEditor.targetLaunchDate ?? ""}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, targetLaunchDate: value || null } : current,
                        )
                      }
                    />
                    <TextArea
                      label="Notes"
                      value={productEditor.notes}
                      onChange={(value) =>
                        setProductEditor((current) =>
                          current ? { ...current, notes: value } : current,
                        )
                      }
                    />
                  </div>

                  <TimelineSummary product={productEditor} />

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
              ) : (
                <EmptyState
                  title="No product selected"
                  description="Select a product card to edit notes, sample dates, bulk timing, and shipping timing."
                />
              )}
            </Card>

            <Card title="Costs">
              {selectedProduct ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                      Total product cost
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">
                      {currency(getProductTotalCost(selectedProduct))}
                    </p>
                    <p className="mt-1 text-sm text-emerald-100/80">
                      {selectedProduct.costs.length} expense entries for {selectedProduct.name}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <Input
                      label="Cost title"
                      value={costDraft.title}
                      onChange={(value) =>
                        setCostDraft((current) => ({ ...current, title: value }))
                      }
                    />
                    <TextArea
                      label="Description"
                      value={costDraft.description}
                      onChange={(value) =>
                        setCostDraft((current) => ({ ...current, description: value }))
                      }
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Amount"
                        type="number"
                        value={String(costDraft.amount)}
                        onChange={(value) =>
                          setCostDraft((current) => ({
                            ...current,
                            amount: Number(value || "0"),
                          }))
                        }
                      />
                      <Input
                        label="Entry date"
                        type="date"
                        value={costDraft.entryDate}
                        onChange={(value) =>
                          setCostDraft((current) => ({ ...current, entryDate: value }))
                        }
                      />
                    </div>
                    <Select
                      label="Cost type"
                      value={costDraft.costType}
                      onChange={(value) =>
                        setCostDraft((current) => ({
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
                    className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                    onClick={() => void handleAddCostEntry()}
                    disabled={saving}
                  >
                    Add cost entry
                  </button>

                  <div className="space-y-3">
                    {selectedProduct.costs.length ? (
                      [...selectedProduct.costs]
                        .sort((left, right) => right.entryDate.localeCompare(left.entryDate))
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-2xl border border-white/10 bg-slate-900/70 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-white">{entry.title}</p>
                                <p className="mt-1 text-sm text-slate-400">
                                  {entry.description || "No description"}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-emerald-200">
                                  {currency(entry.amount)}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {entry.costType}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">
                              {formatDate(entry.entryDate)}
                            </p>
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
              ) : (
                <EmptyState
                  title="Choose a product"
                  description="Cost entries belong to individual products, so select one from the board first."
                />
              )}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  scopeLabel,
  filteredProducts,
  upcomingBulkReady,
  upcomingArrivals,
  dropDays,
}: {
  scopeLabel: string;
  filteredProducts: ProductWithCosts[];
  upcomingBulkReady: { product: ProductWithCosts; bulkReadyDate: string | null }[];
  upcomingArrivals: { product: ProductWithCosts; arrivalDate: string | null }[];
  dropDays: DropDay[];
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
        />
        <StatCard
          label="Samples"
          value={String(filteredProducts.filter((product) => product.status === "sample").length)}
          description="Awaiting review or approval"
          icon={Target}
        />
        <StatCard
          label="Bulk"
          value={String(filteredProducts.filter((product) => product.status === "bulk").length)}
          description="Approved for production"
          icon={Truck}
        />
        <StatCard
          label="Tracked cost"
          value={currency(totalTrackedCost)}
          description="Across selected scope"
          icon={Receipt}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Upcoming Bulk Ready Dates">
          <div className="space-y-3">
            {upcomingBulkReady.length ? (
              upcomingBulkReady.map(({ product, bulkReadyDate }) => (
                <TimelineRow
                  key={`${product.id}-bulk-ready`}
                  title={product.name}
                  subtitle={getDropDayName(dropDays, product.dropDayId)}
                  date={bulkReadyDate}
                  icon={Clock3}
                />
              ))
            ) : (
              <EmptyState
                title="No bulk dates yet"
                description="Set bulk start dates and production days to forecast when product runs will be complete."
              />
            )}
          </div>
        </Card>

        <Card title="Upcoming Arrival Dates">
          <div className="space-y-3">
            {upcomingArrivals.length ? (
              upcomingArrivals.map(({ product, arrivalDate }) => (
                <TimelineRow
                  key={`${product.id}-arrival`}
                  title={product.name}
                  subtitle={getDropDayName(dropDays, product.dropDayId)}
                  date={arrivalDate}
                  icon={Truck}
                />
              ))
            ) : (
              <EmptyState
                title="No arrival dates yet"
                description="Once you add production and shipping business-day lead times, estimated delivery dates will show up here."
              />
            )}
          </div>
        </Card>
      </div>
    </>
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
    <div className="grid gap-4 xl:grid-cols-4">
      {productStatuses.map((status) => {
        const statusProducts = products.filter((product) => product.status === status);

        return (
          <div
            key={status}
            className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/10"
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
                  const primaryMilestone = getProductPrimaryMilestone(product);

                  return (
                    <button
                      key={product.id}
                      className={cn(
                        "w-full rounded-3xl border p-3 text-left transition",
                        selectedProductId === product.id
                          ? "border-emerald-400/50 bg-emerald-400/10"
                          : "border-white/10 bg-slate-900/70 hover:bg-slate-900",
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
                              <p className="truncate font-medium text-white">{product.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-400">
                                {product.category}
                                {product.sku ? ` · ${product.sku}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                              {currency(getProductTotalCost(product))}
                            </span>
                          </div>

                          <p className="mt-2 truncate text-xs text-slate-500">
                            {getDropDayName(dropDays, product.dropDayId)}
                          </p>

                          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                              {primaryMilestone.label}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-100">
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
      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/60">
        <div className="grid grid-cols-[minmax(0,2.2fr)_0.9fr_1.3fr_1.3fr_0.9fr_0.9fr] gap-3 border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <div>Product</div>
          <div>Status</div>
          <div>Drop</div>
          <div>Next date</div>
          <div>Cost</div>
          <div>Move</div>
        </div>

        <div className="max-h-[720px] overflow-y-auto">
          {products.length ? (
            products.map((product) => {
              const primaryMilestone = getProductPrimaryMilestone(product);

              return (
                <div
                  key={product.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,2.2fr)_0.9fr_1.3fr_1.3fr_0.9fr_0.9fr] items-center gap-3 border-b border-white/5 px-4 py-3 transition",
                    selectedProductId === product.id && "bg-emerald-400/10",
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
                      <p className="truncate font-medium text-white">{product.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {product.category}
                        {product.sku ? ` · ${product.sku}` : ""}
                      </p>
                    </div>
                  </button>

                  <div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-slate-200">
                      {getStatusLabel(product.status)}
                    </span>
                  </div>

                  <div className="truncate text-sm text-slate-300">
                    {getDropDayName(dropDays, product.dropDayId)}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-xs uppercase tracking-[0.16em] text-slate-500">
                      {primaryMilestone.label}
                    </p>
                    <p className="truncate text-sm text-slate-100">
                      {formatDate(primaryMilestone.date)}
                    </p>
                  </div>

                  <div className="text-sm font-medium text-slate-100">
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
          "flex items-center justify-center border border-dashed border-white/10 bg-slate-900/60 text-[11px] uppercase tracking-[0.2em] text-slate-500",
          sizeClasses,
        )}
      >
        No image
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden border border-white/10 bg-slate-900/60", sizeClasses)}>
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
}: {
  calendarMonth: Date;
  onPrevious: () => void;
  onNext: () => void;
  items: {
    id: string;
    date: string;
    label: string;
    type: "sample" | "drop" | "bulk" | "arrival" | "drop-day";
  }[];
}) {
  const calendarStart = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const eventsByDate = items.reduce<Record<string, typeof items>>((accumulator, item) => {
    if (!accumulator[item.date]) {
      accumulator[item.date] = [];
    }
    accumulator[item.date].push(item);
    return accumulator;
  }, {});

  return (
    <Card title="Calendar / Schedule">
      <div className="mb-5 flex items-center justify-between">
        <button
          className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 transition hover:bg-white/10"
          onClick={onPrevious}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Viewing month</p>
          <p className="mt-1 text-xl font-semibold">{format(calendarMonth, "MMMM yyyy")}</p>
        </div>
        <button
          className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 transition hover:bg-white/10"
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

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
                "min-h-36 rounded-3xl border p-3",
                isSameMonth(day, calendarMonth)
                  ? "border-white/10 bg-slate-900/70"
                  : "border-white/5 bg-slate-900/30",
                isToday(day) && "border-emerald-400/40 bg-emerald-400/5",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                    isToday(day) ? "bg-emerald-400 text-slate-950" : "bg-white/5 text-white",
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
                    <div
                      key={event.id}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-xs font-medium",
                        event.type === "sample" && "bg-cyan-400/15 text-cyan-100",
                        event.type === "arrival" && "bg-sky-400/15 text-sky-100",
                        event.type === "bulk" && "bg-amber-400/15 text-amber-100",
                        event.type === "drop" && "bg-violet-400/15 text-violet-100",
                        event.type === "drop-day" && "bg-emerald-400/15 text-emerald-100",
                      )}
                    >
                      {event.label}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">No scheduled items</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DropDayOverview({
  dropDays,
  products,
  onOpenDrop,
}: {
  dropDays: DropDay[];
  products: ProductWithCosts[];
  onOpenDrop: (dropDayId: string) => void;
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
            <button
              key={dropDay.id}
              className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-left transition hover:bg-white/[0.08]"
              onClick={() => onOpenDrop(dropDay.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{dropDay.name}</h3>
                  <p className="mt-2 text-sm text-slate-300">{dropDay.description}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                  {formatDate(dropDay.targetDate)}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniMetric
                  label="Products"
                  value={String(dropProducts.length)}
                  accent="text-white"
                />
                <MiniMetric
                  label="Bulk items"
                  value={String(
                    dropProducts.filter((product) => product.status === "bulk").length,
                  )}
                  accent="text-amber-200"
                />
                <MiniMetric
                  label="Tracked cost"
                  value={currency(totalCost)}
                  accent="text-emerald-200"
                />
              </div>
            </button>
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
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
          Estimated sample arrival
        </p>
        <p className="mt-2 text-lg font-semibold text-white">{formatDate(sampleArrivalDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {sampleCountdown === null
            ? "Add sample ordered date plus production and shipping business days."
            : `${sampleCountdown} days from today`}
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Estimated bulk ready</p>
        <p className="mt-2 text-lg font-semibold text-white">{formatDate(bulkReadyDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {bulkCountdown === null
            ? "Add a bulk start date and production business-day lead time."
            : `${bulkCountdown} days from today`}
        </p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Estimated arrival</p>
        <p className="mt-2 text-lg font-semibold text-white">{formatDate(arrivalDate)}</p>
        <p className="mt-1 text-sm text-slate-400">
          {arrivalCountdown === null
            ? "Add shipping business days to estimate delivery."
            : `${arrivalCountdown} days from today`}
        </p>
      </div>
    </div>
  );
}

function TimelineRow({
  title,
  subtitle,
  date,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  date: string | null;
  icon: typeof Clock3;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="rounded-2xl bg-white/5 p-3">
        <Icon className="h-4 w-4 text-emerald-200" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white">{title}</p>
        <p className="truncate text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="text-right">
        <p className="font-medium text-white">{formatDate(date)}</p>
        <p className="text-xs text-slate-500">
          {daysUntil(date) === null ? "" : `${daysUntil(date)} days`}
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
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof Layers3;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{description}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
          <Icon className="h-5 w-5 text-emerald-200" />
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
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
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
          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-lg shadow-black/10">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
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
    <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-5 text-center">
      <p className="font-medium text-white">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
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
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input
        className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
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
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <textarea
        className="min-h-28 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
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
      {!compact ? <span className="mb-2 block text-sm text-slate-300">{label}</span> : null}
      <select
        className={cn(
          "w-full rounded-2xl border border-white/10 bg-slate-900 text-sm text-white outline-none transition focus:border-emerald-400",
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
