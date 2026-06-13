-- Additive production migration for the simplified vendor/store application.
-- This migration intentionally keeps all legacy organizer, event, and booth data.

-- Create enums only when they do not already exist, then add required values.
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('VENDOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'VENDOR';

DO $$ BEGIN
    CREATE TYPE "OrderStatus" AS ENUM ('PREPARING', 'READY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY';

DO $$ BEGIN
    CREATE TYPE "OrderItemStatus" AS ENUM ('PREPARING', 'READY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "OrderItemStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE "OrderItemStatus" ADD VALUE IF NOT EXISTS 'READY';

DO $$ BEGIN
    CREATE TYPE "PaymentMode" AS ENUM ('PAY_AT_COUNTER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'PAY_AT_COUNTER';

DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Existing core tables are retained. These definitions apply only on a database
-- where a table is genuinely absent.
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VENDOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VendorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "phoneNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VendorSettings" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderingOpen" BOOLEAN NOT NULL DEFAULT true,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimitQuantity" INTEGER NOT NULL DEFAULT 0,
    "dailyLimitAutoStop" BOOLEAN NOT NULL DEFAULT true,
    "deviceOrderLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxDrinksPerOrder" INTEGER NOT NULL DEFAULT 99,
    "reportRecipientEmails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VendorDailyUsage" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL,
    "usedQuantity" INTEGER NOT NULL DEFAULT 0,
    "orderingClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorDailyUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MenuItem" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "optionGroups" JSONB,
    "remarksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "basePrepMin" INTEGER NOT NULL DEFAULT 5,
    "extraPerItemMin" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "deviceId" TEXT,
    "vendorId" TEXT NOT NULL,
    "displayNumber" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PREPARING',
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'PAY_AT_COUNTER',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "remark" TEXT,
    "selectedOptions" JSONB,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PREPARING',
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Add columns required by the simplified application to existing tables.
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VendorProfile"
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "category" TEXT,
    ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VendorSettings"
    ADD COLUMN IF NOT EXISTS "orderingOpen" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "showPrices" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "dailyLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "dailyLimitQuantity" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "dailyLimitAutoStop" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "deviceOrderLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "maxDrinksPerOrder" INTEGER NOT NULL DEFAULT 99,
    ADD COLUMN IF NOT EXISTS "reportRecipientEmails" JSONB,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VendorDailyUsage"
    ADD COLUMN IF NOT EXISTS "usedQuantity" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "orderingClosed" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "MenuItem"
    ADD COLUMN IF NOT EXISTS "optionGroups" JSONB,
    ADD COLUMN IF NOT EXISTS "remarksEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "basePrepMin" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "extraPerItemMin" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Order"
    ADD COLUMN IF NOT EXISTS "customerName" TEXT,
    ADD COLUMN IF NOT EXISTS "customerPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "customerEmail" TEXT,
    ADD COLUMN IF NOT EXISTS "deviceId" TEXT,
    ADD COLUMN IF NOT EXISTS "displayNumber" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- New orders no longer belong to an event. Existing eventId values and the
-- Event table are preserved; only the obsolete NOT NULL requirement is relaxed.
DO $$ BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Order'
          AND column_name = 'eventId'
    ) THEN
        ALTER TABLE "Order" ALTER COLUMN "eventId" DROP NOT NULL;
    END IF;
END $$;

ALTER TABLE "OrderItem"
    ADD COLUMN IF NOT EXISTS "remark" TEXT,
    ADD COLUMN IF NOT EXISTS "selectedOptions" JSONB,
    ADD COLUMN IF NOT EXISTS "status" "OrderItemStatus" NOT NULL DEFAULT 'PREPARING';

-- Index creation is idempotent. Historical event-scoped uniqueness is retained;
-- no new cross-event unique index is imposed on existing production data.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "VendorProfile_userId_key" ON "VendorProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "VendorSettings_vendorId_key" ON "VendorSettings"("vendorId");
CREATE INDEX IF NOT EXISTS "VendorDailyUsage_vendorId_date_idx" ON "VendorDailyUsage"("vendorId", "date");
CREATE INDEX IF NOT EXISTS "MenuItem_vendorId_displayOrder_idx" ON "MenuItem"("vendorId", "displayOrder");
CREATE INDEX IF NOT EXISTS "Order_vendorId_createdAt_idx" ON "Order"("vendorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_vendorId_deviceId_createdAt_idx" ON "Order"("vendorId", "deviceId", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS, so guard each foreign key.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendorProfile_userId_fkey') THEN
        ALTER TABLE "VendorProfile"
            ADD CONSTRAINT "VendorProfile_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendorSettings_vendorId_fkey') THEN
        ALTER TABLE "VendorSettings"
            ADD CONSTRAINT "VendorSettings_vendorId_fkey"
            FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VendorDailyUsage_vendorId_fkey') THEN
        ALTER TABLE "VendorDailyUsage"
            ADD CONSTRAINT "VendorDailyUsage_vendorId_fkey"
            FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MenuItem_vendorId_fkey') THEN
        ALTER TABLE "MenuItem"
            ADD CONSTRAINT "MenuItem_vendorId_fkey"
            FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_vendorId_fkey') THEN
        ALTER TABLE "Order"
            ADD CONSTRAINT "Order_vendorId_fkey"
            FOREIGN KEY ("vendorId") REFERENCES "VendorProfile"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_menuItemId_fkey') THEN
        ALTER TABLE "OrderItem"
            ADD CONSTRAINT "OrderItem_menuItemId_fkey"
            FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_orderId_fkey') THEN
        ALTER TABLE "OrderItem"
            ADD CONSTRAINT "OrderItem_orderId_fkey"
            FOREIGN KEY ("orderId") REFERENCES "Order"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;
