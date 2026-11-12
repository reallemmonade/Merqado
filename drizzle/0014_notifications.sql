CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`link` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`snooze_until` integer,
	`next_nudge_at` integer,
	`done_by` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_key` ON `notifications` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `notifications_user_status` ON `notifications` (`user_id`,`status`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `notifications_nudge` ON `notifications` (`next_nudge_at`);