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
    status: text("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    extraCosts: integer("extra_costs").notNull().default(0),
    internalHeadcount: integer("internal_headcount").notNull().default(0),
    internalDays: real("internal_days").notNull().default(0),
    internalLaborAmount: integer("internal_labor_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull(),
    createdBy: text("created_by").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_estimates_group_version").on(table.groupId, table.version),
    index("idx_estimates_updated_at").on(table.updatedAt),
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
