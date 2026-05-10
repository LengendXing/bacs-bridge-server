CREATE TABLE `machines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`os_type` text DEFAULT 'linux' NOT NULL,
	`auth_type` text DEFAULT 'password' NOT NULL,
	`username` text NOT NULL,
	`password` text,
	`private_key` text,
	`passphrase` text,
	`notes` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_heartbeat` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `bindings` ADD `machine_id` integer REFERENCES machines(id);