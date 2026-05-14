CREATE TABLE `bacs_chat_time_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL DEFAULT 'feishu',
	`target_ip` text NOT NULL DEFAULT 'localhost',
	`process_name` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
