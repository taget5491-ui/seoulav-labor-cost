ALTER TABLE `estimates` ADD `manager_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `start_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `end_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `estimates` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `idx_estimates_status_updated` ON `estimates` (`status`,`updated_at`);