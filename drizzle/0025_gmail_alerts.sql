CREATE TABLE `gmail_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`account` text DEFAULT '' NOT NULL,
	`encrypted_token` text NOT NULL,
	`history_id` text,
	`checked_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`engagement_id` text,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`link` text NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`snooze_until` integer,
	`next_nudge_at` integer,
	`nudged_at` integer,
	`done_by` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "user_id", "engagement_id", "kind", "key", "title", "body", "link", "data", "status", "snooze_until", "next_nudge_at", "nudged_at", "done_by", "occurred_at", "created_at", "updated_at") SELECT "id", "user_id", "engagement_id", "kind", "key", "title", "body", "link", "data", "status", "snooze_until", "next_nudge_at", "nudged_at", "done_by", "occurred_at", "created_at", "updated_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_key` ON `notifications` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `notifications_user_status` ON `notifications` (`user_id`,`status`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `notifications_nudge` ON `notifications` (`next_nudge_at`);