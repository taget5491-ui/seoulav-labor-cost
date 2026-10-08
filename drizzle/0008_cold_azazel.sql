CREATE TABLE `app_users` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT '' NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
