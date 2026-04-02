-- Add optional customer email to Order for customer notifications
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;

-- Optional: index if you plan to query by customerEmail frequently (not required for current usage)
-- CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order" ("customerEmail");
