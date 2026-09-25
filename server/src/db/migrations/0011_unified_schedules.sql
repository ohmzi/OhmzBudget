CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`amount_type` text DEFAULT 'exact' NOT NULL,
	`recurrence_type` text NOT NULL,
	`recurrence_rule` text DEFAULT '{}' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`weekend_adjust` text DEFAULT 'none' NOT NULL,
	`date_flexibility` integer DEFAULT 3 NOT NULL,
	`account_id` text,
	`transfer_account_id` text,
	`category_id` text,
	`payee_id` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`auto_create` integer DEFAULT 0 NOT NULL,
	`auto_create_from` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`occurrence_horizon` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transfer_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`payee_id`) REFERENCES `payees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_schedules_status` ON `schedules` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_schedules_payee` ON `schedules` (`payee_id`);
--> statement-breakpoint
CREATE INDEX `idx_schedules_account` ON `schedules` (`account_id`);
--> statement-breakpoint
CREATE TABLE `schedule_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`expected_date` text NOT NULL,
	`expected_amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`matched_transaction_id` text,
	`match_type` text,
	`match_confidence` integer,
	`skipped_at` text,
	`paid_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occ_schedule_date_unique` ON `schedule_occurrences` (`schedule_id`, `scheduled_date`);
--> statement-breakpoint
CREATE INDEX `idx_occ_expected_date` ON `schedule_occurrences` (`expected_date`);
--> statement-breakpoint
CREATE INDEX `idx_occ_status` ON `schedule_occurrences` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_occ_matched_tx_unique` ON `schedule_occurrences` (`matched_transaction_id`);
--> statement-breakpoint
CREATE TABLE `schedule_match_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`occurrence_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`dismissed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`occurrence_id`) REFERENCES `schedule_occurrences`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dismissal_unique` ON `schedule_match_dismissals` (`occurrence_id`, `transaction_id`);
--> statement-breakpoint
INSERT INTO `schedules` (`id`, `name`, `amount`, `amount_type`, `recurrence_type`, `recurrence_rule`, `start_date`, `end_date`, `account_id`, `category_id`, `payee_id`, `notes`, `status`, `auto_create`, `source`, `created_at`, `updated_at`)
SELECT
	`id`,
	`title`,
	`amount`,
	CASE WHEN `is_approximate` = 1 THEN 'approximate' ELSE 'exact' END,
	`frequency`,
	'{}',
	`start_date`,
	`end_date`,
	`account_id`,
	`category_id`,
	`payee_id`,
	`notes`,
	`status`,
	`auto_create`,
	'manual',
	`created_at`,
	`updated_at`
FROM `recurring_transactions`;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `schedule_id` text REFERENCES schedules(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `idx_transactions_schedule` ON `transactions` (`schedule_id`);
--> statement-breakpoint
UPDATE `transactions` SET `schedule_id` = `recurring_transaction_id` WHERE `recurring_transaction_id` IS NOT NULL;
