CREATE TABLE `cheers` (
	`garden_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`garden_id`, `user_id`),
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `garden_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`user_id` text NOT NULL,
	`image` blob NOT NULL,
	`thumb` blob NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`caption` text,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `garden_photos_garden_idx` ON `garden_photos` (`garden_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reporter_key` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_once_idx` ON `reports` (`target_type`,`target_id`,`reporter_key`);--> statement-breakpoint
ALTER TABLE `gardens` ADD `is_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gardens` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `gardens` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `gardens_public_idx` ON `gardens` (`is_public`,`updated_at`);--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `code_hash` text;--> statement-breakpoint
ALTER TABLE `login_tokens` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `handle` text;--> statement-breakpoint
ALTER TABLE `users` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_idx` ON `users` (`handle`);