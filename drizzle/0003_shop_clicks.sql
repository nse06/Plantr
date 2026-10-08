CREATE TABLE `shop_clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant` text NOT NULL,
	`item` text NOT NULL,
	`affiliate` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shop_clicks_created_idx` ON `shop_clicks` (`created_at`);