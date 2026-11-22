CREATE TYPE "VendorPermission" AS ENUM ('ADMIN', 'BARISTA');

ALTER TABLE "User"
  ADD COLUMN "permission" "VendorPermission" NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "vendorId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "User_vendorId_idx" ON "User"("vendorId");
