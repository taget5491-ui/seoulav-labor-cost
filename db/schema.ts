import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const estimates = sqliteTable(
  "estimates",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull(),
    version: integer("version").notNull().default(1),
    projectName: text("project_name").notNull(),
    siteName: text("site_name").notNull().default(""),
    companyName: text("company_name").notNull().default(""),
    managerName: text("manager_name").notNull().default(""),
    startDate: text("start_date").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    status: text("status").notNull().default("draft"),
    archivedAt: text("archived_at"),
    notes: text("notes").notNull().default(""),
    extraCosts: integer("extra_costs").notNull().default(0),
    internalHeadcount: integer("internal_headcount").notNull().default(0),
    internalDays: real("internal_days").notNull().default(0),
    internalLaborAmount: integer("internal_labor_amount").notNull().default(0),
    quotedLaborAmount: integer("quoted_labor_amount").notNull().default(0),
    quoteFileKey: text("quote_file_key").notNull().default(""),
    quoteFileName: text("quote_file_name").notNull().default(""),
    quoteFileSize: integer("quote_file_size").notNull().default(0),
    totalAmount: integer("total_amount").notNull(),
    createdBy: text("created_by").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_estimates_group_version").on(table.groupId, table.version),
    index("idx_estimates_updated_at").on(table.updatedAt),
    index("idx_estimates_status_updated").on(table.status, table.updatedAt),
  ],
);

export const laborEntries = sqliteTable(
  "labor_entries",
  {
    id: text("id").primaryKey(),
    estimateId: text("estimate_id")
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    workSite: text("work_site").notNull().default(""),
    workDate: text("work_date").notNull(),
    dayType: text("day_type").notNull(),
    headcount: integer("headcount").notNull(),
    days: real("days").notNull(),
    contractorType: text("contractor_type").notNull().default("legacy"),
    contractorName: text("contractor_name").notNull().default(""),
    contractorQuoteAmount: integer("contractor_quote_amount").notNull().default(0),
    applyOverhead: integer("apply_overhead", { mode: "boolean" }).notNull().default(false),
    additionalCost: integer("additional_cost").notNull().default(0),
    useBaseRate: integer("use_base_rate", { mode: "boolean" }).notNull().default(true),
    manualLaborAmount: integer("manual_labor_amount").notNull().default(0),
    manualLaborEnabled: integer("manual_labor_enabled", { mode: "boolean" }).notNull().default(true),
    baseRate: integer("base_rate").notNull(),
    adminRate: real("admin_rate").notNull(),
    toolRate: real("tool_rate").notNull(),
    daySurcharge: integer("day_surcharge").notNull(),
    baseAmount: integer("base_amount").notNull(),
    adminAmount: integer("admin_amount").notNull(),
    toolAmount: integer("tool_amount").notNull(),
    surchargeAmount: integer("surcharge_amount").notNull(),
    totalAmount: integer("total_amount").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("idx_labor_entries_estimate_id").on(table.estimateId)],
);

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  userId: text("user_id").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  passwordHash: text("password_hash").notNull().default(""),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userEmail: text("user_email").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
