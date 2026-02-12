
-- Update specific event to use static map
UPDATE "Event"
SET "mapImageUrl" = '/maps/sg-food-fest-2026.jpg'
WHERE id = 'a995af42-fc7a-492c-a41b-c3b5dabc1d8d';

-- Bulk update legacy uploads to static map (safety net)
UPDATE "Event"
SET "mapImageUrl" = '/maps/sg-food-fest-2026.jpg'
WHERE "mapImageUrl" LIKE '/uploads/%' AND "status" = 'ACTIVE';
