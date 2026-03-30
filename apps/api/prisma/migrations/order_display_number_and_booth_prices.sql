ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "displayNumber" integer NOT NULL DEFAULT 0;

-- Ensure uniqueness per vendor
DO $$ BEGIN
  CREATE UNIQUE INDEX "Order_vendorId_displayNumber_unique" ON "Order" ("vendorId", "displayNumber");
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- Helpful indexes for performance
CREATE INDEX IF NOT EXISTS "Order_vendorId_createdAt_idx" ON "Order" ("vendorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order" ("status");
CREATE INDEX IF NOT EXISTS "Order_completedAt_idx" ON "Order" ("completedAt");

-- Backfill displayNumber by vendor using createdAt ascending
WITH ranked AS (
  SELECT id, "vendorId",
         row_number() OVER (PARTITION BY "vendorId" ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Order"
)
UPDATE "Order" o
SET "displayNumber" = ranked.rn
FROM ranked
WHERE o.id = ranked.id
  AND (o."displayNumber" = 0 OR o."displayNumber" IS NULL);

-- Booth price visibility toggle
ALTER TABLE "Booth"
ADD COLUMN IF NOT EXISTS "showPrices" boolean NOT NULL DEFAULT true;
