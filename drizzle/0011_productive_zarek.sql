CREATE TABLE `project_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`site_name` text DEFAULT '' NOT NULL,
	`project_name` text NOT NULL,
	`manager_name` text DEFAULT '' NOT NULL,
	`company_name` text DEFAULT '' NOT NULL,
	`risk_grade` text DEFAULT '일반작업' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`work_description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_project_plans_dates` ON `project_plans` (`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `idx_project_plans_site` ON `project_plans` (`site_name`);