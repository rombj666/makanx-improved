-- Delete all existing test orders (clean reset)
-- This will remove all OrderItem and Order records

-- First delete all order items (due to foreign key constraints)
DELETE FROM "OrderItem";

-- Then delete all orders
DELETE FROM "Order";