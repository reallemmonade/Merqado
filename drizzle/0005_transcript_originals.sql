CREATE TABLE `source_blobs` (
	`source_id` text PRIMARY KEY NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `expert_transcripts` ADD `source_id` text REFERENCES sources(id) ON DELETE set null;