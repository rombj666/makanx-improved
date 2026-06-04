ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_eventId_deviceId_key" ON "Order"("eventId", "deviceId");
CREATE INDEX IF NOT EXISTS "Order_deviceId_idx" ON "Order"("deviceId");
