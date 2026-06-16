-- Move customer ordering to direct vendor slugs and remove the legacy
-- organizer/event/booth/application workflow tables.
-- This migration does not delete active vendor, menu, order, or order item data.

ALTER TABLE "VendorProfile"
    ADD COLUMN IF NOT EXISTS "slug" TEXT;

WITH normalized AS (
    SELECT
        "id",
        COALESCE(
            NULLIF(
                regexp_replace(
                    regexp_replace(lower("businessName"), '[^a-z0-9]+', '-', 'g'),
                    '(^-+|-+$)',
                    '',
                    'g'
                ),
                ''
            ),
            'vendor-' || left("id", 8)
        ) AS "baseSlug"
    FROM "VendorProfile"
),
numbered AS (
    SELECT
        "id",
        "baseSlug",
        row_number() OVER (PARTITION BY "baseSlug" ORDER BY "id") AS "rn"
    FROM normalized
)
UPDATE "VendorProfile" vp
SET "slug" = CASE
    WHEN numbered."rn" = 1 THEN numbered."baseSlug"
    ELSE numbered."baseSlug" || '-' || numbered."rn"
END
FROM numbered
WHERE vp."id" = numbered."id"
  AND (vp."slug" IS NULL OR trim(vp."slug") = '');

ALTER TABLE "VendorProfile"
    ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "VendorProfile_slug_key" ON "VendorProfile"("slug");

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_eventId_fkey";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "eventId";

DROP TABLE IF EXISTS "InviteToken";
DROP TABLE IF EXISTS "VendorApplication";
DROP TABLE IF EXISTS "Booth";
DROP TABLE IF EXISTS "Event";

DROP TYPE IF EXISTS "ApplicationStatus";
DROP TYPE IF EXISTS "EventStatus";
