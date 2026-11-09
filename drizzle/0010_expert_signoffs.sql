ALTER TABLE `experts` ADD `requested_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `experts` ADD `approvals` text DEFAULT '[]' NOT NULL;