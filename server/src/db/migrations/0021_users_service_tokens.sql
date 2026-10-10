CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text DEFAULT 'member' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL,
  `last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username` COLLATE NOCASE);
--> statement-breakpoint
CREATE TABLE `service_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `token_hash` text NOT NULL,
  `scopes` text DEFAULT '[]' NOT NULL,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `last_used_at` text,
  `revoked_at` text
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` text REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
DELETE FROM `sessions`;
--> statement-breakpoint
ALTER TABLE `auth_config` ADD `secret` text;
