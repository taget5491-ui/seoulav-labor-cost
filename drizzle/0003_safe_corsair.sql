ALTER TABLE `estimates` ADD `quoted_labor_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `quote_file_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `quote_file_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `quote_file_size` integer DEFAULT 0 NOT NULL;