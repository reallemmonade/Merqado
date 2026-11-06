CREATE TABLE `case_budgets` (
	`engagement_id` text PRIMARY KEY NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`planned_interviews` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `case_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount` integer NOT NULL,
	`spent_on` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_expenses_engagement` ON `case_expenses` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `expert_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`name` text NOT NULL,
	`target` integer DEFAULT 5 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expert_topics_engagement` ON `expert_topics` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `expert_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`expert_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`kind` text DEFAULT 'call' NOT NULL,
	`filename` text NOT NULL,
	`body` text NOT NULL,
	`discussed_topic_ids` text DEFAULT '[]' NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`expert_id`) REFERENCES `experts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `expert_transcripts_expert` ON `expert_transcripts` (`expert_id`);--> statement-breakpoint
CREATE TABLE `expert_types` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`name` text NOT NULL,
	`target` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expert_types_engagement` ON `expert_types` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `experts` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`type_id` text,
	`status` text DEFAULT 'proposed' NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`anon_title` text,
	`is_former` integer DEFAULT false NOT NULL,
	`interview_date` text,
	`network` text DEFAULT '' NOT NULL,
	`call_minutes` integer DEFAULT 0 NOT NULL,
	`followup_minutes` integer DEFAULT 0 NOT NULL,
	`survey_minutes` integer DEFAULT 0 NOT NULL,
	`hourly_rate` integer DEFAULT 0 NOT NULL,
	`topic_ids` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`guide` text,
	`guide_updated_at` integer,
	`proposed_by` text,
	`approved_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `expert_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `experts_engagement` ON `experts` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `hypotheses` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`statement` text NOT NULL,
	`slide_ref` text DEFAULT '' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hypotheses_engagement` ON `hypotheses` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `key_takeaways` (
	`id` text PRIMARY KEY NOT NULL,
	`expert_id` text NOT NULL,
	`engagement_id` text NOT NULL,
	`body` text NOT NULL,
	`verdict` text DEFAULT 'new' NOT NULL,
	`hypothesis_id` text,
	`locator` text DEFAULT '' NOT NULL,
	`included` integer DEFAULT true NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`expert_id`) REFERENCES `experts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hypothesis_id`) REFERENCES `hypotheses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `key_takeaways_engagement` ON `key_takeaways` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `running_guides` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`type_id` text,
	`body` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `expert_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `running_guides_engagement` ON `running_guides` (`engagement_id`);