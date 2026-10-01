-- One order per device per Malaysia calendar day per event.
-- Adds a Malaysia-calendar-date column and a unique constraint so that even
-- racing concurrent requests cannot place two orders from the same device on
-- the same day. NULL deviceId / deviceOrderDate rows (guest orders without a
-- device) are exempt because Postgres unique constraints treat NULLs as
-- distinct values.

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "deviceOrderDate" TEXT;

-- Backfill only the FIRST order of each (event, device, Malaysia date) group.
-- Pre-existing duplicate rows created by the old race are left with NULL so
-- this migration never fails on historical bad data.
WITH ranked AS (
    SELECT
        "id",
        row_number() OVER (
            PARTITION BY
                "eventId",
                "deviceId",
                (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date)
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS rn
    FROM "Order"
    WHERE "deviceId" IS NOT NULL
)
UPDATE "Order" o
SET "deviceOrderDate" = (("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuala_Lumpur')::date)::text
FROM ranked r
WHERE o."id" = r."id" AND r.rn = 1;

DO $$ BEGIN
    ALTER TABLE "Order"
        ADD CONSTRAINT "Order_eventId_deviceId_deviceOrderDate_key"
        UNIQUE ("eventId", "deviceId", "deviceOrderDate");
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
