CREATE TABLE `firm_domains` (
	`domain` text PRIMARY KEY NOT NULL,
	`firm_id` text NOT NULL,
	`default_firm_role_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`firm_id`) REFERENCES `firms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_firm_role_id`) REFERENCES `firm_roles`(`id`) ON UPDATE no action ON DELETE no action
);
