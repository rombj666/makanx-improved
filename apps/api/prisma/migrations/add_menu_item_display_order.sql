ALTER TABLE "MenuItem"
ADD COLUMN IF NOT EXISTS "displayOrder" integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    "vendorId",
    row_number() OVER (
      PARTITION BY "vendorId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "MenuItem"
)
UPDATE "MenuItem" m
SET "displayOrder" = ranked.rn
FROM ranked
WHERE m.id = ranked.id
  AND m."displayOrder" = 0;

CREATE INDEX IF NOT EXISTS "MenuItem_vendorId_displayOrder_idx"
ON "MenuItem" ("vendorId", "displayOrder");
