ALTER TABLE `sources` ADD `origin_kind` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `origin_ref` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `origin_url` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `origin_version` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `origin_checked_at` integer;--> statement-breakpoint
CREATE INDEX `sources_origin` ON `sources` (`origin_kind`,`origin_ref`);