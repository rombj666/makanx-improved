ALTER TABLE "VendorDailyUsage"
ADD COLUMN IF NOT EXISTS "eventId" TEXT;

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "eventId" TEXT;

UPDATE "Order" o
SET "eventId" = b."eventId"
FROM (
  SELECT DISTINCT ON ("vendorId") "vendorId", "eventId"
  FROM "Booth"
  WHERE "vendorId" IS NOT NULL
  ORDER BY "vendorId", "eventId"
) b
WHERE o."eventId" IS NULL
  AND o."vendorId" = b."vendorId";

ALTER TABLE "Order"
ALTER COLUMN "eventId" SET NOT NULL;

DROP INDEX IF EXISTS "Order_vendorId_displayNumber_key";
DROP INDEX IF EXISTS "Order_vendorId_displayNumber_unique";
DROP INDEX IF EXISTS "Order_vendorId_orderDate_displayNumber_key";
DROP INDEX IF EXISTS "Order_eventId_vendorId_displayNumber_key";

CREATE UNIQUE INDEX "Order_eventId_vendorId_displayNumber_key"
ON "Order" ("eventId", "vendorId", "displayNumber");

CREATE INDEX IF NOT EXISTS "Order_eventId_vendorId_idx"
ON "Order" ("eventId", "vendorId");

DROP INDEX IF EXISTS "VendorDailyUsage_vendorId_date_key";
DROP INDEX IF EXISTS "VendorDailyUsage_vendorId_eventId_date_key";

CREATE UNIQUE INDEX "VendorDailyUsage_vendorId_eventId_date_key"
ON "VendorDailyUsage" ("vendorId", "eventId", "date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Order_eventId_fkey'
  ) THEN
    ALTER TABLE "Order"
    ADD CONSTRAINT "Order_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
