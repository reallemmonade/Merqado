CREATE TABLE `meeting_sync` (
	`engagement_id` text PRIMARY KEY NOT NULL,
	`auto` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`external_id` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`start_at` integer NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	`join_url` text,
	`online_meeting_id` text,
	`attendees` text DEFAULT '[]' NOT NULL,
	`matched_by` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`found_by` text,
	`added_by` text,
	`transcript_status` text DEFAULT 'none' NOT NULL,
	`transcript_source_id` text,
	`transcript_checked_at` integer,
	`recording_id` text,
	`recording_via` text,
	`takeaways` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`found_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transcript_source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recording_via`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meetings_case_event` ON `meetings` (`engagement_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `meetings_case_status` ON `meetings` (`engagement_id`,`status`,`start_at`);--> statement-breakpoint
CREATE TABLE `microsoft_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`account` text DEFAULT '' NOT NULL,
	`tenant_id` text DEFAULT '' NOT NULL,
	`encrypted_token` text NOT NULL,
	`transcripts` integer DEFAULT false NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
