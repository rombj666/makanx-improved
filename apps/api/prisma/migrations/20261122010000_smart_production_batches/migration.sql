ALTER TABLE "VendorSettings"
  ADD COLUMN IF NOT EXISTS "defaultBatchSize" INTEGER NOT NULL DEFAULT 10;

CREATE TYPE "ProductionBatchStatus" AS ENUM ('PREPARING', 'READY', 'CANCELLED');
CREATE TYPE "ProductionBatchItemStatus" AS ENUM ('PREPARING', 'READY', 'CANCELLED');

CREATE TABLE "ProductionBatch" (
  "id" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "batchNumber" INTEGER NOT NULL,
  "status" "ProductionBatchStatus" NOT NULL DEFAULT 'PREPARING',
  "capacity" INTEGER NOT NULL,
  "recipeSignature" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "drinkName" TEXT NOT NULL,
  "selectedOptions" JSONB,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionBatch_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductionBatch_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionBatch_eventId_batchNumber_key" ON "ProductionBatch"("eventId", "batchNumber");
CREATE INDEX "ProductionBatch_vendorId_eventId_status_idx" ON "ProductionBatch"("vendorId", "eventId", "status");

CREATE TABLE "ProductionBatchItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "ProductionBatchItemStatus" NOT NULL DEFAULT 'PREPARING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readyAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "ProductionBatchItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductionBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductionBatchItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionBatchItem_orderItemId_key" ON "ProductionBatchItem"("orderItemId");
CREATE INDEX "ProductionBatchItem_batchId_status_idx" ON "ProductionBatchItem"("batchId", "status");