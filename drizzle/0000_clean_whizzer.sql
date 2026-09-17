CREATE TABLE `estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`project_name` text NOT NULL,
	`site_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`extra_costs` integer DEFAULT 0 NOT NULL,
	`total_amount` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_estimates_group_version` ON `estimates` (`group_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_estimates_updated_at` ON `estimates` (`updated_at`);--> statement-breakpoint
CREATE TABLE `labor_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`estimate_id` text NOT NULL,
	`description` text NOT NULL,
	`work_date` text NOT NULL,
	`day_type` text NOT NULL,
	`headcount` integer NOT NULL,
	`days` real NOT NULL,
	`base_rate` integer NOT NULL,
	`admin_rate` real NOT NULL,
	`tool_rate` real NOT NULL,
	`day_surcharge` integer NOT NULL,
	`base_amount` integer NOT NULL,
	`admin_amount` integer NOT NULL,
	`tool_amount` integer NOT NULL,
	`surcharge_amount` integer NOT NULL,
	`total_amount` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`estimate_id`) REFERENCES `estimates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_labor_entries_estimate_id` ON `labor_entries` (`estimate_id`);