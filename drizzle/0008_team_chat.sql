CREATE TABLE `chat_reactions` (
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`message_id`, `user_id`, `emoji`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_reads` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `user_id`),
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `mentions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `edited_at` integer;--> statement-breakpoint
CREATE INDEX `chat_messages_parent` ON `chat_messages` (`parent_id`);--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `kind` text DEFAULT 'room' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `member_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_rooms` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `presence` text DEFAULT 'auto' NOT NULL;