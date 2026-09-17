ALTER TABLE `labor_entries` ADD `contractor_type` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `labor_entries` ADD `contractor_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `labor_entries` ADD `contractor_quote_amount` integer DEFAULT 0 NOT NULL;