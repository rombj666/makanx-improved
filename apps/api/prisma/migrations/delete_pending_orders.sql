-- Delete legacy PENDING orders
DELETE FROM "Order" WHERE status = 'PENDING';
