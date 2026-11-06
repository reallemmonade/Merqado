ALTER TABLE `expert_transcripts` ADD `cleaned_body` text;--> statement-breakpoint
ALTER TABLE `expert_transcripts` ADD `clean_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `expert_transcripts` ADD `clean_flags` text DEFAULT '[]' NOT NULL;