import type {
  WorkspaceMember,
  WorkspacePermission,
  WorkspacePermissions,
} from "@/lib/types";

export const workspacePermissionOptions: {
  key: WorkspacePermission;
  label: string;
  description: string;
}[] = [
  { key: "create_products", label: "Create products", description: "Add new products." },
  { key: "edit_products", label: "Edit products", description: "Edit product details and timelines." },
  { key: "move_stages", label: "Move stages", description: "Move products between workflow stages." },
  { key: "manage_calendar", label: "Move calendar dates", description: "Drag product and drop dates." },
  { key: "manage_drop_days", label: "Manage drop days", description: "Create, edit, and archive drops." },
  { key: "manage_events", label: "Manage calendar events", description: "Add, edit, delete, and move custom events." },
  { key: "manage_images", label: "Manage images", description: "Upload and remove product images." },
  { key: "add_costs", label: "Add costs", description: "Enter new product expenses." },
  { key: "edit_costs", label: "Edit costs", description: "Correct existing expenses." },
  { key: "delete_costs", label: "Delete costs", description: "Remove expense entries." },
  { key: "view_cost_amounts", label: "View cost amounts", description: "See individual expense amounts." },
  { key: "view_total_costs", label: "View total costs", description: "See product and workspace totals." },
];

export const defaultWorkspacePermissions: WorkspacePermissions =
  workspacePermissionOptions.reduce(
    (permissions, option) => ({ ...permissions, [option.key]: true }),
    {} as WorkspacePermissions,
  );

export function normalizeWorkspacePermissions(value: unknown): WorkspacePermissions {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return workspacePermissionOptions.reduce(
    (permissions, option) => ({
      ...permissions,
      [option.key]:
        typeof source[option.key] === "boolean"
          ? Boolean(source[option.key])
          : defaultWorkspacePermissions[option.key],
    }),
    {} as WorkspacePermissions,
  );
}

export function hasWorkspacePermission(
  member: WorkspaceMember | null,
  permission: WorkspacePermission,
) {
  return Boolean(
    member?.status === "active" &&
      (member.role === "admin" || member.permissions[permission]),
  );
}
