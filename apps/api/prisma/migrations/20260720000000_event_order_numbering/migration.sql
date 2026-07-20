-- Add event-scoped order numbering without deleting or renumbering internal IDs.
DO $$ BEGIN
    CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "nextOrderNumber" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "eventId" TEXT,
    ADD COLUMN IF NOT EXISTS "eventOrderNumber" INTEGER;

-- Each vendor receives one archived container for its existing orders. Stable,
-- deterministic IDs make this data migration safe to re-run during recovery.
INSERT INTO "Event" (
    "id", "vendorId", "eventName", "eventDate", "status",
    "nextOrderNumber", "createdAt", "updatedAt"
)
SELECT
    'previous-orders-' || o."vendorId",
    o."vendorId",
    'Previous Orders',
    COALESCE(MIN(o."createdAt")::date, CURRENT_DATE),
    'ARCHIVED'::"EventStatus",
    COUNT(*)::integer + 1,
    COALESCE(MIN(o."createdAt"), CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "Order" o
WHERE o."eventId" IS NULL
GROUP BY o."vendorId"
ON CONFLICT ("id") DO NOTHING;

WITH ordered AS (
    SELECT
        o."id",
        'previous-orders-' || o."vendorId" AS "legacyEventId",
        row_number() OVER (
            PARTITION BY o."vendorId"
            ORDER BY o."displayNumber" ASC, o."createdAt" ASC, o."id" ASC
        )::integer AS "legacyOrderNumber"
    FROM "Order" o
    WHERE o."eventId" IS NULL
)
UPDATE "Order" o
SET
    "eventId" = ordered."legacyEventId",
    "eventOrderNumber" = ordered."legacyOrderNumber"
FROM ordered
WHERE o."id" = ordered."id";

-- Order rows are event-owned after the backfill. On an empty database these
-- constraints are also safe because there are no rows to migrate.
ALTER TABLE "Order"
    ALTER COLUMN "eventId" SET NOT NULL,
    ALTER COLUMN "eventOrderNumber" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Event_vendorId_status_idx" ON "Event"("vendorId", "status");
CREATE INDEX IF NOT EXISTS "Event_vendorId_eventDate_idx" ON "Event"("vendorId", "eventDate");
CREATE INDEX IF NOT EXISTS "Order_eventId_createdAt_idx" ON "Order"("eventId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_eventId_eventOrderNumber_key"
    ON "Order"("eventId", "eventOrderNumber");

-- PostgreSQL partial uniqueness enforces the one-active-event invariant even
-- when two activation requests arrive at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS "Event_one_active_per_vendor_key"
    ON "Event"("vendorId") WHERE "status" = 'ACTIVE';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Event_vendorId_fkey') THEN
        ALTER TABLE "Event"
            ADD CONSTRAINT "Event_vendorId_fkey"
            FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_eventId_fkey') THEN
        ALTER TABLE "Order"
            ADD CONSTRAINT "Order_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "Event"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
