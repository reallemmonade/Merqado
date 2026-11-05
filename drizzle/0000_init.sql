CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`encrypted_config` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `engagement_members` (
	`engagement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access` text DEFAULT 'editor' NOT NULL,
	PRIMARY KEY(`engagement_id`, `user_id`),
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `engagements` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`client_name` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`starts_on` text,
	`ends_on` text,
	`ai_provider_id` text,
	`storage_connection_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `engagements_firm` ON `engagements` (`firm_id`);--> statement-breakpoint
CREATE TABLE `finding_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_id` text NOT NULL,
	`source_id` text NOT NULL,
	`locator` text,
	`quote` text,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`statement` text NOT NULL,
	`workstream` text,
	`status` text DEFAULT 'hypothesis' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `findings_engagement` ON `findings` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `firm_members` (
	`firm_id` text NOT NULL,
	`user_id` text NOT NULL,
	`firm_role_id` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`firm_id`, `user_id`),
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`firm_role_id`) REFERENCES `firm_roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `firm_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`title` text NOT NULL,
	`archetype` text NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firm_roles_firm_title` ON `firm_roles` (`firm_id`,`title`);--> statement-breakpoint
CREATE TABLE `firms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`ai_billing_mode` text DEFAULT 'managed' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firms_slug_unique` ON `firms` (`slug`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`engagement_id` text NOT NULL,
	`storage_connection_id` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sources_engagement` ON `sources` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `storage_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`encrypted_config` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`engagement_id` text,
	`user_id` text,
	`ai_provider_id` text,
	`billing_mode` text NOT NULL,
	`provider_kind` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`feature` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_firm_time` ON `usage_events` (`firm_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);