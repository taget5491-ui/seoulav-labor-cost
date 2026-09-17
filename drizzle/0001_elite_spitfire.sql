ALTER TABLE `estimates` ADD `company_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `internal_headcount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `internal_days` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `internal_labor_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `labor_entries` ADD `work_site` text DEFAULT '' NOT NULL;