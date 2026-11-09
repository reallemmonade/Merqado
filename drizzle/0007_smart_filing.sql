CREATE TABLE `case_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`path` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_folders_path` ON `case_folders` (`engagement_id`,`path`);--> statement-breakpoint
ALTER TABLE `sources` ADD `filing` text DEFAULT 'filed' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `suggestions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `links` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `version_of` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD `version_candidate` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `rel_path` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `text_body` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `room_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `message_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `sources_hash` ON `sources` (`engagement_id`,`content_hash`);