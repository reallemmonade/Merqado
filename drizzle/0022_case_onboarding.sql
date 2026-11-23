CREATE TABLE `case_onboarding` (
	`engagement_id` text PRIMARY KEY NOT NULL,
	`case_code` text DEFAULT '' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `firms` ADD `onboarding_standard` text;