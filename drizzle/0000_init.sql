CREATE TABLE `gardens` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`guest_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`zip` text NOT NULL,
	`zone` text NOT NULL,
	`season` text NOT NULL,
	`year` integer NOT NULL,
	`input` text NOT NULL,
	`plan` text NOT NULL,
	`photo` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gardens_owner_idx` ON `gardens` (`owner_id`);--> statement-breakpoint
CREATE INDEX `gardens_guest_idx` ON `gardens` (`guest_id`);--> statement-breakpoint
CREATE TABLE `journal` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`plant_id` text,
	`amount` real,
	`unit` text,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `journal_garden_idx` ON `journal` (`garden_id`);--> statement-breakpoint
CREATE TABLE `login_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`next` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_status` (
	`garden_id` text NOT NULL,
	`task_id` text NOT NULL,
	`done_at` text NOT NULL,
	PRIMARY KEY(`garden_id`, `task_id`),
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`digest` integer DEFAULT true NOT NULL,
	`last_digest_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);