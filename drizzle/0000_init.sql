CREATE TABLE "schematics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"size" jsonb NOT NULL,
	"block_count" integer NOT NULL,
	"materials" jsonb NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schematic_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"server" jsonb NOT NULL,
	"origin" jsonb NOT NULL,
	"rotation" integer NOT NULL,
	"chest_pos" jsonb,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"stage" text,
	"cursor" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"accuracy" real,
	"report" jsonb,
	"missing" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_schematic_id_schematics_id_fk" FOREIGN KEY ("schematic_id") REFERENCES "public"."schematics"("id") ON DELETE no action ON UPDATE no action;