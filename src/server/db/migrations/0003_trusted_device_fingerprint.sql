ALTER TABLE `trusted_devices` ADD `device_id` text;
--> statement-breakpoint
CREATE INDEX `trusted_devices_user_device_idx` ON `trusted_devices` (`user_id`, `device_id`);
