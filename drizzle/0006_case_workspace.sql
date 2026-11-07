CREATE TABLE `case_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`body` text NOT NULL,
	`module_id` text,
	`origin` text DEFAULT '' NOT NULL,
	`link` text,
	`is_private` integer DEFAULT false NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `workplan_modules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `case_notes_engagement` ON `case_notes` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`user_id` text,
	`body` text NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chat_messages_room` ON `chat_messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`name` text NOT NULL,
	`archetypes` text DEFAULT '[]' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_rooms_engagement` ON `chat_rooms` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `deck_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`slide_id` text,
	`claim` text DEFAULT '' NOT NULL,
	`other_ref` text DEFAULT '' NOT NULL,
	`other_claim` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`fix` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slide_id`) REFERENCES `deck_slides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_issues_engagement` ON `deck_issues` (`engagement_id`,`kind`);--> statement-breakpoint
CREATE TABLE `deck_learnings` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`rule` text NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_learnings_engagement` ON `deck_learnings` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `deck_slides` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`section` text DEFAULT '' NOT NULL,
	`headline` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`source_note` text DEFAULT '' NOT NULL,
	`module_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `workplan_modules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deck_slides_engagement` ON `deck_slides` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `glossary_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`term` text NOT NULL,
	`category` text DEFAULT 'Industry' NOT NULL,
	`definition` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `glossary_terms_engagement` ON `glossary_terms` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `gpt_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`folder` text DEFAULT '' NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gpt_chats_engagement` ON `gpt_chats` (`engagement_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `gpt_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `gpt_chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gpt_messages_chat` ON `gpt_messages` (`chat_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workplan_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`label` text NOT NULL,
	`date` text NOT NULL,
	`is_column` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workplan_milestones_engagement` ON `workplan_milestones` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `workplan_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`name` text NOT NULL,
	`lead_id` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workplan_modules_engagement` ON `workplan_modules` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `workplan_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`module_id` text NOT NULL,
	`milestone_id` text,
	`title` text NOT NULL,
	`assignee_id` text,
	`status` text DEFAULT 'not_yet' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `workplan_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `workplan_milestones`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workplan_tasks_engagement` ON `workplan_tasks` (`engagement_id`);--> statement-breakpoint
ALTER TABLE `sources` ADD `folder` text DEFAULT '' NOT NULL;