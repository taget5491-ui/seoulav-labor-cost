ALTER TABLE `labor_entries` ADD `use_base_rate` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `labor_entries` ADD `manual_labor_amount` integer DEFAULT 0 NOT NULL;