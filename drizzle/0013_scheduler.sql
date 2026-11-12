CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`slot` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`result` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_job_slot` ON `job_runs` (`job`,`slot`);--> statement-breakpoint
CREATE INDEX `job_runs_started` ON `job_runs` (`started_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `time_zone` text;