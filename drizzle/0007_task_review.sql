ALTER TABLE `workplan_tasks` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `workplan_tasks` ADD `reviewer_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `workplan_tasks` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `workplan_tasks` ADD `review_note` text DEFAULT '' NOT NULL;