CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`user_id` text,
	`note` text NOT NULL,
	`photo` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `feedback_firm` ON `feedback` (`firm_id`,`created_at`);