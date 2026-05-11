CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `bindings` ADD `model_override` text;--> statement-breakpoint
ALTER TABLE `bindings` ADD `effort` text;--> statement-breakpoint
ALTER TABLE `machines` ADD `os_version` text;--> statement-breakpoint
ALTER TABLE `machines` ADD `builtin` integer DEFAULT false NOT NULL;