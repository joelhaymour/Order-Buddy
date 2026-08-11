export const productStatuses = [
  "idea",
  "sample",
  "bulk",
  "launched",
  "canceled",
] as const;

export const workflowActions = [
  "order-first-sample",
  "first-sample-ordered",
  "sample-revision",
  "bulk-ordered",
  "track-delivery",
  "bulk-received",
  "launched",
] as const;

export const costTypes = [
  "sample",
  "shipping",
  "duties",
  "bulk",
  "misc",
] as const;

export type ProductStatus = (typeof productStatuses)[number];
export type WorkflowAction = (typeof workflowActions)[number];
export type CostType = (typeof costTypes)[number];
export type ProductPriority = "low" | "medium" | "high" | "urgent";
export type WorkspaceRole = "admin" | "member";
export type WorkspaceMemberStatus = "pending" | "active" | "removed";
export type WorkspacePermission =
  | "create_products"
  | "edit_products"
  | "move_stages"
  | "manage_calendar"
  | "manage_drop_days"
  | "manage_events"
  | "manage_images"
  | "add_costs"
  | "edit_costs"
  | "delete_costs"
  | "view_cost_amounts"
  | "view_total_costs";
export type WorkspacePermissions = Record<WorkspacePermission, boolean>;

export type WorkspaceSettings = {
  storeName: string;
};

export type WorkspaceMember = {
  userId: string;
  email: string;
  fullName: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  permissions: WorkspacePermissions;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceInvitation = {
  id: string;
  email: string;
  role: WorkspaceRole;
  permissions: WorkspacePermissions;
  status: "pending" | "accepted" | "revoked" | "failed";
  expiresAt: string;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  message: string;
  user: string;
  createdAt: string;
};

export type CalendarNoteEvent = {
  id: string;
  title: string;
  notes: string;
  date: string;
};

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
  archived: boolean;
  customEvents: CalendarNoteEvent[];
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
  workflowAction: WorkflowAction | null;
  nextAction: string;
  owner: string;
  priority: ProductPriority;
  dueDate: string | null;
  activity: ActivityEntry[];
  createdAt: string;
  updatedAt: string;
};

export type ProductWithCosts = Product & {
  costs: CostEntry[];
  totalCost: number | null;
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
  workflowAction: WorkflowAction | null;
  nextAction: string;
  owner: string;
  priority: ProductPriority;
  dueDate: string | null;
  activity: ActivityEntry[];
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
