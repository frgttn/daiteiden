CREATE TABLE `meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source` (
	`name` text PRIMARY KEY,
	`snapshot` text,
	`last_ok_at` integer,
	`failing` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriber` (
	`chat_id` integer PRIMARY KEY,
	`grp` text NOT NULL,
	`notify` integer DEFAULT true NOT NULL,
	`possible` integer DEFAULT true NOT NULL,
	`told` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
