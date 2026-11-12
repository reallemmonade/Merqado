ALTER TABLE `workplan_tasks` ADD `updated_at` integer;--> statement-breakpoint
UPDATE `workplan_tasks` SET `updated_at` = `created_at`;